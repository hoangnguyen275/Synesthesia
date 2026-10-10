function buildPlaylists(genres, genreResults) {
  const combined = [];
  const seen = new Set();
  const maxLength = Math.max(0, ...genreResults.map(songs => songs.length));
  for (let i = 0; i < maxLength; i++) {
    for (const songs of genreResults) {
      const song = songs[i];
      if (song && !seen.has(song.id)) { seen.add(song.id); combined.push(song); }
    }
  }
  const playlists = [];
  const signatures = new Set();
  const add = (id, title, description, songs) => {
    const unique = [...new Map(songs.map(song => [song.id, song])).values()].slice(0, 15);
    const signature = unique.map(song => song.id).sort().join(',');
    if (!unique.length || signatures.has(signature)) return;
    signatures.add(signature);
    playlists.push({ id, title, description, songs: unique });
  };
  add('mood-mix', 'Your mood mix', 'A blend of the sounds suggested by your photo.', combined);
  genreResults.forEach((songs, i) => add(`genre-${i}`, `${genres[i]} collection`, `Explore the ${genres[i]} side of this moment.`, songs));
  add('discoveries', 'More discoveries', 'More tracks beyond your first mix.', combined.slice(15));
  return { recommendations: combined.slice(0, 15), playlists };
}
module.exports = { buildPlaylists };
