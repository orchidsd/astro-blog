import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
		// Load Markdown and MDX files in the `src/content/blog/` directory.
		loader: glob({
			base: './src/content/blog',
			pattern: '**/*.{md,mdx}',
			// hexo URL 保持文件名原始大小写，Astro 默认 slug 会小写化，需覆盖
			generateId: ({ entry }) => entry.replace(/\.(md|mdx)$/, ''),
		}),
	// Type-check frontmatter using a schema
	schema: z.object({
		title: z.string(),
		description: z.string().optional().default(''),
		pubDate: z.coerce.date(),
		date: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		categories: z.array(z.string()).optional().default([]),
		tags: z.array(z.string()).optional().default([]),
		ai: z.coerce.boolean().optional().default(false),
		top: z.coerce.number().optional().default(0),
		top_group_index: z.coerce.number().optional().default(0),
		swiper_index: z.coerce.number().optional().default(0),
		heroImage: z.optional(z.string()),
	}),
});

export const collections = { blog };