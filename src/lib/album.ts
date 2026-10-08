import album from '../data/album.json';

export type AlbumEntry = (typeof album)[number];

export function findAlbum(pathname: string): AlbumEntry | undefined {
	return album.find((a) => a.path_name === pathname);
}

export function allAlbums(): AlbumEntry[] {
	return album;
}