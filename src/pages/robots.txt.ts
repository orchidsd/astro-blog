import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
	const host = site ? site.hostname : 'example.com';
	const body = `User-agent: *
Allow: /

Sitemap: https://${host}/sitemap-index.xml
`;
	return new Response(body, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};