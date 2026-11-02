"use client";
/* AnimatedList from Magic UI (https://magicui.design, MIT License, Copyright (c) Magic UI; see ./LICENSE.md),
 * adapted: plain CSS classes, and every item at once (no motion) under reduced motion. Items appear one by one,
 * newest on top; the list holds only real rows passed in. */
import React, { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import { AnimatePresence, motion, useReducedMotion, type MotionProps } from "motion/react";

export function AnimatedListItem({ children }: { children: React.ReactNode }) {
  const animations: MotionProps = {
    initial: { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1, originY: 0 },
    exit: { scale: 0, opacity: 0 },
    transition: { type: "spring", stiffness: 350, damping: 40 },
  };
  return <motion.div {...animations} layout className="mu-alist__item">{children}</motion.div>;
}

export interface AnimatedListProps extends ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode;
  delay?: number;
}

export const AnimatedList = React.memo(({ children, className, delay = 1000, ...props }: AnimatedListProps) => {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const childrenArray = useMemo(() => React.Children.toArray(children), [children]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (!reduce && index < childrenArray.length - 1) timeout = setTimeout(() => setIndex(i => (i + 1) % childrenArray.length), delay);
    return () => { if (timeout !== null) clearTimeout(timeout); };
  }, [index, delay, childrenArray.length, reduce]);

  const itemsToShow = useMemo(() => (reduce ? [...childrenArray].reverse() : childrenArray.slice(0, index + 1).reverse()), [index, childrenArray, reduce]);

  return (
    <div className={["mu-alist", className].filter(Boolean).join(" ")} {...props}>
      {reduce ? itemsToShow.map(item => <div key={(item as React.ReactElement).key} className="mu-alist__item">{item}</div>)
        : <AnimatePresence>{itemsToShow.map(item => <AnimatedListItem key={(item as React.ReactElement).key}>{item}</AnimatedListItem>)}</AnimatePresence>}
    </div>
  );
});
AnimatedList.displayName = "AnimatedList";
