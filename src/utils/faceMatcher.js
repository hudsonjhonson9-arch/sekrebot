export function euclideanDistance(desc1, desc2) {
  if (!desc1 || !desc2) return 999;
  const d1 = Array.isArray(desc1) ? desc1 : Array.from(desc1);
  const d2 = Array.isArray(desc2) ? desc2 : Array.from(desc2);
  if (d1.length !== d2.length || d1.length === 0) return 999;

  let sum = 0;
  for (let i = 0; i < d1.length; i++) {
    sum += (d1[i] - d2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

export const MATCH_THRESHOLD = 0.6; // Typical threshold
