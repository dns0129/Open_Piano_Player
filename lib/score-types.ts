export type Hand = "right" | "left";
export type Meter = [number, number];
export type Provenance = "source" | "inferred" | "edited";
export interface WrittenPitch {
  step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  alter: number;
  octave: number;
  provenance: Provenance;
}
export interface SourcePosition {
  page: number;
  system: number;
  x: number;
  y: number;
}
export interface WrittenRhythm {
  type: "breve" | "whole" | "half" | "quarter" | "eighth" | "16th" | "32nd" | "64th" | "128th" | "256th";
  dots: number;
  tuplets?: Array<{ actual: number; normal: number; group?: string }>;
}
export interface ScoreNote {
  id: string;
  midi: number;
  beat: number;
  duration: number;
  hand: Hand;
  voice?: string;
  staff?: number;
  pitch?: WrittenPitch;
  accidental?: string;
  sourcePositions?: SourcePosition[];
  rhythm?: WrittenRhythm;
  velocity: number;
  tieTo?: string;
  [effect: string]: unknown;
}
export interface WrittenNote extends ScoreNote {
  pitch: WrittenPitch;
  staff: number;
  voice: string;
}
export interface ScoreRest {
  id: string;
  beat: number;
  duration: number;
  staff: number;
  voice: string;
  hand: Hand;
  provenance: Provenance;
  sourcePositions?: SourcePosition[];
  rhythm?: WrittenRhythm;
}
export interface Measure {
  measure?: number;
  beat: number;
  duration: number;
  timeSignature: Meter;
  keySignature?: number;
  [key: string]: unknown;
}
export interface Lineage {
  originalId: string;
  parentId?: string;
  publishedFromId?: string;
}
export interface SourceNotation {
  version: number;
  coordinateSpace: string;
  scoreId: string;
  systems: Array<Record<string, unknown> & { id: string; imageUrl?: string }>;
  notes: Array<Record<string, unknown> & { noteId: string }>;
  measureMap?: Measure[];
}
export interface PracticeScore {
  instrument?: "piano" | "guitar";
  version: 1;
  id: string;
  title: string;
  composer: string;
  tempo: number;
  tempoEvidence?: {
    version: 1;
    sourceStatus: 'read' | 'not-marked' | 'unreadable' | 'unknown';
    sourceBpm: number | null;
    rawBpm: number | null;
    playbackSource: 'source-reading' | 'user-practice' | 'default-practice';
  };
  timeSignature: Meter;
  keySignature: number;
  mode?: "major" | "minor";
  durationBeats: number;
  notes: ScoreNote[];
  source: {
    kind: string;
    label: string;
    url?: string;
    license?: string;
    reviewRequired?: boolean;
  };
  measureMap?: Measure[];
  tempoMap?: Array<{ beat: number; bpm: number; curve: "step" | "linear" }>;
  fermatas?: Array<{ beat: number; holdBeats: number }>;
  rests?: ScoreRest[];
  sourceNotation?: SourceNotation;
  lineage?: Lineage;
  notationInference?: string[];
}
export interface ScoreDocument
  extends Omit<PracticeScore, "version" | "notes" | "rests"> {
  schema: "qinban.score";
  version: 2;
  notes: WrittenNote[];
  rests: ScoreRest[];
  lineage: Lineage;
  migration?: { fromVersion: 1; inferred: string[] };
}
export interface LibraryRecord {
  id: string;
  document: ScoreDocument;
  score: PracticeScore;
  revision: number;
  createdAt: string;
  updatedAt: string;
  sourceNotation: SourceNotation | null;
  assets: Array<{
    id: string;
    page?: number;
    system?: number;
    mimeType: string;
    data: string;
  }>;
  reviewStatus: unknown;
  warnings: string[];
  downloaded: boolean;
  history: Array<Omit<LibraryRecord, "history">>;
  sourceReference?: unknown;
  publication?: unknown;
  originalFile?: { name: string; mimeType: string; data: string };
}
