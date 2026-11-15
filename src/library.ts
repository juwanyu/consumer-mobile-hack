import library from '../shared/assetLibrary.json';

export { library };

export type GenreId = keyof typeof library.genres;
export const GENRES = Object.entries(library.genres).map(([id, g]) => ({ id: id as GenreId, ...g }));
export const LOCATIONS = Object.entries(library.locations).map(([id, l]) => ({ id, label: l.label }));

const titleCase = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const ACTIONS = library.actions.map((id) => ({ id, label: titleCase(id) }));
export const CAMERA_MARKS = library.camera_marks.map((id) => ({ id, label: titleCase(id) }));
export const CAMERA_MOVES = library.camera_moves.map((id) => ({ id, label: titleCase(id) }));

export const GENRE_COLORS: Record<string, string> = {
  heist: '#FFD23F',
  zombie: '#3DDC84',
  space: '#2EE6FF',
  romcom: '#FF2E88',
  kaiju: '#FF7A1A',
  western: '#E0A060',
};
