/** Public task metadata only. Arguments, hashes, outputs and audit payloads stay local. */
export interface CoreTaskSummary {
  id: string;
  status: string;
  cursor: number;
  created_at: string;
  updated_at: string;
}
export interface CoreTaskDetail extends CoreTaskSummary {
  cancel_requested: boolean;
  steps: { ordinal: number; tool: string; permission: 'read' | 'reversible' | 'sensitive'; status: string }[];
}
