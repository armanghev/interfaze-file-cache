import { z } from "zod";

export const samples = {
  receipt: {
    label: "Receipt (PNG)",
    path: "/samples/receipt.png",
    contentType: "image/png",
    schema: z.object({ merchant: z.string(), date: z.string().describe("YYYY-MM-DD"), total: z.number() }),
  },
  invoice: {
    label: "Invoice (2-page PDF)",
    path: "/samples/invoice.pdf",
    contentType: "application/pdf",
    schema: z.object({ invoice_number: z.string(), due_date: z.string().describe("YYYY-MM-DD"), total_due: z.number() }),
  },
  "id-card": {
    label: "ID card (PNG)",
    path: "/samples/id-card.png",
    contentType: "image/png",
    schema: z.object({ full_name: z.string(), id_number: z.string(), date_of_birth: z.string().describe("YYYY-MM-DD") }),
  },
} as const;

export type SampleName = keyof typeof samples;

/** Each step of the experiment: which bypass header (if any) the request carries. */
export const steps = [
  { id: "prime", label: "1st call", header: null, note: "Primes the cache" },
  { id: "repeat", label: "2nd call", header: null, note: "Same request again" },
  { id: "new", label: "Bypass, SDK 1.0.3", header: "x-interfaze-bypass-cache", note: "Header the current SDK sends" },
  { id: "old", label: "Bypass, SDK ≤ 1.0.2", header: "x-bypass-cache", note: "Header older SDKs send" },
] as const;

export type StepId = (typeof steps)[number]["id"];
