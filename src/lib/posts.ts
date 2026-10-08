import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** hexo slugify：空格、斜杠 → '-'，与 hexo 站点 URL 保持一致 */
export function taxSlug(name: string): string {
	return name.replace(/[\s/]/g, '-');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** URL 沿用 hexo：/YYYY/MM/DD/<相对路径slug>/ */
export function postSlug(post: Post): string {
	return post.id.replace(/\.md$/, '');
}

export function postPathParts(post: Post): {
	year: string;
	month: string;
	day: string;
	slug: string;
} {
	const d = post.data.pubDate;
	return {
		year: String(d.getFullYear()),
		month: pad(d.getMonth() + 1),
		day: pad(d.getDate()),
		slug: postSlug(post),
	};
}

export function postHref(post: Post): string {
	const { year, month, day, slug } = postPathParts(post);
	return `/${year}/${month}/${day}/${slug}/`;
}

export function postUrl(post: Post): URL {
	return new URL(postHref(post), import.meta.env.SITE);
}