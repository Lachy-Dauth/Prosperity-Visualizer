// Largest-Triangle-Three-Buckets downsampling.
export function lttb(xs, ys, targetPoints) {
  const n = xs.length;
  if (n <= targetPoints || targetPoints < 3) {
    return { xs: Array.from(xs), ys: Array.from(ys) };
  }
  const sampledX = new Array(targetPoints);
  const sampledY = new Array(targetPoints);
  const bucketSize = (n - 2) / (targetPoints - 2);
  let a = 0;
  sampledX[0] = xs[0];
  sampledY[0] = ys[0];
  for (let i = 0; i < targetPoints - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    let avgX = 0;
    let avgY = 0;
    let avgN = 0;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const yv = ys[j];
      if (Number.isFinite(yv)) {
        avgX += xs[j];
        avgY += yv;
        avgN++;
      }
    }
    if (avgN === 0) {
      sampledX[i + 1] = xs[rangeStart];
      sampledY[i + 1] = ys[rangeStart];
      a = rangeStart;
      continue;
    }
    avgX /= avgN;
    avgY /= avgN;
    const aPrevStart = Math.floor(i * bucketSize) + 1;
    const aPrevEnd = Math.floor((i + 1) * bucketSize) + 1;
    const ax = xs[a];
    const ay = ys[a];
    let maxArea = -1;
    let nextA = aPrevStart;
    for (let j = aPrevStart; j < aPrevEnd; j++) {
      const px = xs[j];
      const py = ys[j];
      if (!Number.isFinite(py)) continue;
      const area =
        Math.abs((ax - avgX) * (py - ay) - (ax - px) * (avgY - ay)) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        nextA = j;
      }
    }
    sampledX[i + 1] = xs[nextA];
    sampledY[i + 1] = ys[nextA];
    a = nextA;
  }
  sampledX[targetPoints - 1] = xs[n - 1];
  sampledY[targetPoints - 1] = ys[n - 1];
  return { xs: sampledX, ys: sampledY };
}
