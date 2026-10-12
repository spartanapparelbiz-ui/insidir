import test from "node:test";
import assert from "node:assert/strict";
import {validateManualHolding} from "../src/manual-holdings.mjs";

test("accepts valid ticker and fractional positions, with normalized symbol",()=>{
  assert.deepEqual(validateManualHolding({ticker:" aapl ",quantity:"2.50000001"}),{ticker:"AAPL",quantity:"2.50000001"});
  assert.deepEqual(validateManualHolding({ticker:"BRK.B",quantity:1}),{ticker:"BRK.B",quantity:"1"});
  assert.deepEqual(validateManualHolding({ticker:"MSFT",quantity:"0.00000001"}),{ticker:"MSFT",quantity:"0.00000001"});
});
test("rejects fake orders, invalid tickers, negative and excessive quantities",()=>{
  for(const value of [
    null, [],{ticker:"AAPL",quantity:0},{ticker:"AAPL",quantity:-1},
    {ticker:"AAPL",quantity:"1e10"},{ticker:"AAPL",quantity:"0.000000001"},
    {ticker:"AAPL",quantity:"1000000001"},{ticker:"AAPL",quantity:"Infinity"},
    {ticker:"AAPL",quantity:"1; DELETE FROM users"},{ticker:"../../AAPL",quantity:1},
    {ticker:"",quantity:1},{ticker:"AAPL",quantity:{}}
  ]) assert.throws(()=>validateManualHolding(value),{status:400});
});
