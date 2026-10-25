import { z } from "zod";

export interface Fixture {
  name: string;
  path: string;
  contentType: string;
  /** Schema A is the "first question" about the file. */
  schemaA: z.ZodObject;
  /** Schema B asks something different about the same file, to test first-pass cache reuse. */
  schemaB: z.ZodObject;
}

export const fixtures: Fixture[] = [
  {
    name: "receipt",
    path: "samples/receipt.png",
    contentType: "image/png",
    schemaA: z.object({
      merchant: z.string(),
      date: z.string().describe("YYYY-MM-DD"),
      total: z.number(),
    }),
    schemaB: z.object({
      items: z.array(z.object({ description: z.string(), price: z.number() })),
      tax: z.number(),
    }),
  },
  {
    name: "invoice",
    path: "samples/invoice.pdf",
    contentType: "application/pdf",
    schemaA: z.object({
      invoice_number: z.string(),
      due_date: z.string().describe("YYYY-MM-DD"),
      total_due: z.number(),
    }),
    schemaB: z.object({
      bill_to: z.string(),
      line_item_count: z.number().int(),
      subtotal: z.number(),
    }),
  },
  {
    name: "id-card",
    path: "samples/id-card.png",
    contentType: "image/png",
    schemaA: z.object({
      full_name: z.string(),
      id_number: z.string(),
      date_of_birth: z.string().describe("YYYY-MM-DD"),
    }),
    schemaB: z.object({
      issued: z.string().describe("YYYY-MM-DD"),
      expires: z.string().describe("YYYY-MM-DD"),
      issuing_country: z.string(),
    }),
  },
];
