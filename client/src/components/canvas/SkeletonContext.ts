import { createContext, useContext } from "react";

export const SkeletonContext = createContext(false);
export const useSkeleton = () => useContext(SkeletonContext);
