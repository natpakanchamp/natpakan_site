import { defineCollection, z } from 'astro:content';

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
  }),
});

export const collections = { posts };
