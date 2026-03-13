export interface BoneMapping {
  jaw?: string;
  leftEye?: string;
  rightEye?: string;
  leftEyebrow?: string;
  rightEyebrow?: string;
  upperLip?: string;
  lowerLip?: string;
}

export type Phoneme = 'A' | 'I' | 'U' | 'E' | 'O' | 'silent';

export const PHONEME_ROTATIONS: Record<Phoneme, { jaw: [number, number, number, number] }> = {
  A: { jaw: [0.087, 0, 0, 0.996] }, // ~10 deg open
  I: { jaw: [0.044, 0, 0, 0.999] }, // ~5 deg open
  U: { jaw: [0.065, 0, 0, 0.998] }, // ~7.5 deg open
  E: { jaw: [0.052, 0, 0, 0.999] }, // ~6 deg open
  O: { jaw: [0.078, 0, 0, 0.997] }, // ~9 deg open
  silent: { jaw: [0, 0, 0, 1] }, // closed
};
