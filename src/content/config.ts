import { defineCollection, z } from 'astro:content';

const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  group: z.string().optional(),
});

const graphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});

const graphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    categories: z.array(z.string()).optional().default([]),
    page_css: z.string().optional(),
    page_js: z.string().optional(),
    permalink: z.string().optional(),
    author: z.string().optional(),
    excerpt: z.string().optional(),
    graph: graphSchema.optional(),
  }),
});

export const collections = { posts };
