/**
 * Crossref API を使ってDOIからメタデータを取得
 * 
 * @param {string} doi - "10.1145/xxxxxxx" の形式など
 * @returns {Promise<Object>} 
 *   { title, authors, year, references: [{title, doi, year}, ...], ... }
 */
async function fetchCrossrefData(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Crossref API error: ${res.status}`);
  }

  const json = await res.json();
  const message = json.message;

  // タイトル(配列の場合がある)・著者名・出版年・引用文献(ある場合)
  const title = Array.isArray(message.title) ? message.title[0] : message.title;
  const authors = message.author ? message.author.map(a => {
    // 姓/名が分かれている場合が多い
    const family = a.family || '';
    const given = a.given || '';
    return (family + ' ' + given).trim();
  }) : [];

  let year = null;
  if (message['published-print'] && message['published-print']['date-parts']) {
    year = message['published-print']['date-parts'][0][0];
  } else if (message['published-online'] && message['published-online']['date-parts']) {
    year = message['published-online']['date-parts'][0][0];
  }

  // references 取得 (無い場合もある)
  const references = [];
  if (Array.isArray(message.reference)) {
    message.reference.forEach(ref => {
      const refTitle = ref['article-title'] || ref['journal-title'] || '';
      const refDoi = ref.DOI || '';
      const refYear = ref['year'] || '';
      references.push({
        title: refTitle,
        doi: refDoi,
        year: refYear
      });
    });
  }

  return {
    title: title || '',
    authors,
    year: year || 'N/A',
    doi,
    references
  };
}
