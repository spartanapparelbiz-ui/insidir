"""Optional asset step: 4x photo super-resolution with Real-ESRGAN, without PyTorch.

The repository's photographs are 500-2400 px wide; a 1080x1920 frame with a camera push needs
more. This reads the official Real-ESRGAN weights (BSD-3-Clause, github.com/xinntao/Real-ESRGAN),
rebuilds the network as an ONNX graph and runs it with onnxruntime on the CPU, tile by tile.

Weights are pickles. They are read with an allow-list unpickler that can only rebuild tensors
(the equivalent of torch.load(weights_only=True)); anything else in the file is refused.

  python3 -I tools/upscale/upscale.py --model RealESRGAN_x4plus.pth --out DIR photo.jpg [...]

Requires: numpy, onnx, onnxruntime, pillow (see requirements.txt).
"""
import argparse
import io
import os
import pickle
import sys
import time
import zipfile

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper
from PIL import Image

# ---------- safe weight loading ----------

_DTYPES = {"FloatStorage": np.float32, "HalfStorage": np.float16, "DoubleStorage": np.float64}


class _Storage:
    def __init__(self, dtype, key):
        self.dtype, self.key = dtype, key


def _rebuild_tensor_v2(storage, offset, size, stride, *_):
    data = storage.array
    itemsize = data.dtype.itemsize
    return np.lib.stride_tricks.as_strided(data[offset:], shape=tuple(size), strides=tuple(s * itemsize for s in stride)).copy()


class _WeightsUnpickler(pickle.Unpickler):
    ALLOWED = {("collections", "OrderedDict"), ("torch._utils", "_rebuild_tensor_v2")} | {("torch", n) for n in _DTYPES}

    def __init__(self, data, archive, prefix):
        super().__init__(data)
        self.archive, self.prefix = archive, prefix

    def find_class(self, module, name):
        if (module, name) not in self.ALLOWED:
            raise pickle.UnpicklingError(f"refusing {module}.{name} in a weights file")
        if module == "collections":
            import collections
            return collections.OrderedDict
        if name == "_rebuild_tensor_v2":
            return _rebuild_tensor_v2
        return _DTYPES[name]

    def persistent_load(self, pid):
        kind, dtype, key, _location, _numel = pid
        if kind != "storage":
            raise pickle.UnpicklingError("unexpected persistent id")
        storage = _Storage(dtype, key)
        raw = self.archive.read(f"{self.prefix}/data/{key}")
        storage.array = np.frombuffer(raw, dtype=dtype)
        return storage


def load_weights(path):
    with zipfile.ZipFile(path) as archive:
        pkl = next(n for n in archive.namelist() if n.endswith("/data.pkl"))
        prefix = pkl.rsplit("/", 1)[0]
        state = _WeightsUnpickler(io.BytesIO(archive.read(pkl)), archive, prefix).load()
    for key in ("params_ema", "params"):
        if isinstance(state, dict) and key in state:
            state = state[key]
            break
    return {k: np.asarray(v, dtype=np.float32) for k, v in state.items()}


# ---------- ONNX graph builders ----------

class _Graph:
    def __init__(self, weights):
        self.w, self.nodes, self.inits, self.n = weights, [], [], 0

    def name(self, base):
        self.n += 1
        return f"{base}_{self.n}"

    def const(self, array, base="c"):
        name = self.name(base)
        self.inits.append(numpy_helper.from_array(np.asarray(array), name))
        return name

    def op(self, op_type, inputs, **attrs):
        out = self.name(op_type.lower())
        self.nodes.append(helper.make_node(op_type, inputs, [out], **attrs))
        return out

    def conv(self, x, key):
        w = self.const(self.w[key + ".weight"], key.replace(".", "_") + "_w")
        b = self.const(self.w[key + ".bias"], key.replace(".", "_") + "_b")
        k = self.w[key + ".weight"].shape[-1]
        return self.op("Conv", [x, w, b], kernel_shape=[k, k], pads=[k // 2] * 4)

    def lrelu(self, x):
        return self.op("LeakyRelu", [x], alpha=0.2)

    def scale(self, x, s):
        return self.op("Mul", [x, self.const(np.array(s, dtype=np.float32))])

    def up2(self, x):
        scales = self.const(np.array([1, 1, 2, 2], dtype=np.float32))
        return self.op("Resize", [x, "", scales], mode="nearest", coordinate_transformation_mode="asymmetric", nearest_mode="floor")

    def model(self, out):
        graph = helper.make_graph(self.nodes, "sr", [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, None, None])],
                                  [helper.make_tensor_value_info(out, TensorProto.FLOAT, [1, 3, None, None])], self.inits)
        m = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
        m.ir_version = 8
        return m


def build_rrdbnet(w):
    """RealESRGAN_x4plus: RRDBNet(num_feat=64, num_block=23, num_grow_ch=32, scale=4)."""
    g = _Graph(w)
    feat = g.conv("input", "conv_first")
    body = feat
    blocks = sorted({int(k.split(".")[1]) for k in w if k.startswith("body.")})
    for i in blocks:
        rrdb_in = body
        x = body
        for r in (1, 2, 3):
            p = f"body.{i}.rdb{r}"
            parts = [x]
            for c in (1, 2, 3, 4):
                cat = parts[0] if len(parts) == 1 else g.op("Concat", parts, axis=1)
                parts.append(g.lrelu(g.conv(cat, f"{p}.conv{c}")))
            x5 = g.conv(g.op("Concat", parts, axis=1), f"{p}.conv5")
            x = g.op("Add", [g.scale(x5, 0.2), x])
        body = g.op("Add", [g.scale(x, 0.2), rrdb_in])
    feat = g.op("Add", [feat, g.conv(body, "conv_body")])
    feat = g.lrelu(g.conv(g.up2(feat), "conv_up1"))
    feat = g.lrelu(g.conv(g.up2(feat), "conv_up2"))
    return g.model(g.conv(g.lrelu(g.conv(feat, "conv_hr")), "conv_last"))


def build_compact(w):
    """realesr-general-x4v3: SRVGGNetCompact(num_feat=64, num_conv=32, upscale=4, act=prelu)."""
    g = _Graph(w)
    convs = sorted(int(k.split(".")[1]) for k in w if k.startswith("body.") and k.endswith(".bias") and w[k.replace("bias", "weight")].ndim == 4)
    x = "input"
    for idx in convs:
        x = g.conv(x, f"body.{idx}")
        slope_key = f"body.{idx + 1}.weight"
        if slope_key in w and w[slope_key].ndim == 1:
            x = g.op("PRelu", [x, g.const(w[slope_key].reshape(-1, 1, 1), "prelu")])
    x = g.op("DepthToSpace", [x], blocksize=4, mode="CRD")
    base = g.op("Resize", ["input", "", g.const(np.array([1, 1, 4, 4], dtype=np.float32))], mode="nearest", coordinate_transformation_mode="asymmetric", nearest_mode="floor")
    return g.model(g.op("Add", [x, base]))


def build(path):
    w = load_weights(path)
    return build_rrdbnet(w) if "conv_first.weight" in w else build_compact(w)


# ---------- tiled inference ----------

def upscale(session, img, tile=160, pad=12, scale=4):
    """img: HxWx3 float32 in [0,1]. Tiles overlap by `pad` px so seams never show."""
    h, w, _ = img.shape
    out = np.zeros((h * scale, w * scale, 3), dtype=np.float32)
    for y0 in range(0, h, tile):
        for x0 in range(0, w, tile):
            y1, x1 = min(h, y0 + tile), min(w, x0 + tile)
            py0, px0, py1, px1 = max(0, y0 - pad), max(0, x0 - pad), min(h, y1 + pad), min(w, x1 + pad)
            patch = img[py0:py1, px0:px1].transpose(2, 0, 1)[None]
            res = session.run(None, {"input": np.ascontiguousarray(patch)})[0][0].transpose(1, 2, 0)
            oy, ox = (y0 - py0) * scale, (x0 - px0) * scale
            out[y0 * scale:y1 * scale, x0 * scale:x1 * scale] = res[oy:oy + (y1 - y0) * scale, ox:ox + (x1 - x0) * scale]
    return np.clip(out, 0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--threads", type=int, default=os.cpu_count() or 4)
    ap.add_argument("images", nargs="+")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = args.threads
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(build(args.model).SerializeToString(), opts, providers=["CPUExecutionProvider"])
    for path in args.images:
        t = time.time()
        img = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
        res = upscale(session, img)
        name = os.path.splitext(os.path.basename(path))[0] + ".png"
        Image.fromarray((res * 255.0 + 0.5).astype(np.uint8)).save(os.path.join(args.out, name), optimize=False, compress_level=3)
        print(f"{os.path.basename(path)}: {img.shape[1]}x{img.shape[0]} -> {res.shape[1]}x{res.shape[0]} in {time.time() - t:.0f}s", flush=True)


if __name__ == "__main__":
    sys.exit(main())
