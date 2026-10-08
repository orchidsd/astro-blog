import { getCollection } from 'astro:content';
import { postHref, taxSlug } from '../lib/posts';

export async function GET() {
	const posts = await getCollection('blog');
	const index = posts.map((post) => ({
		title: post.data.title,
		href: postHref(post),
		description: post.data.description ?? '',
		categories: post.data.categories ?? [],
		tags: (post.data.tags ?? []).map((t) => taxSlug(t)),
		meta: post.data.meta,
	}));
	return new Response(JSON.stringify(index));
}