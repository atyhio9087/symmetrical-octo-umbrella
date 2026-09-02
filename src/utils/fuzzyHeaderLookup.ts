/**
 * Case/punctuation-insensitive header lookup shared by every raw-row normalizer (project rows,
 * company template rows): given a raw spreadsheet/CSV row and a list of acceptable header aliases,
 * finds the first matching column and returns its value. Consistently reused so a project row and
 * a company template row tolerate the same kinds of header variation.
 */
export function makeFuzzyRowLookup(rawRow: Record<string, any>) {
  const rawKeys = Object.keys(rawRow);
  return (keys: string[]) => {
    const matchedKey = rawKeys.find(rk => {
      const normalizedRk = rk.toLowerCase().replace(/[^a-z0-9]/g, "");
      return keys.some(k => normalizedRk.includes(k.toLowerCase().replace(/[^a-z0-9]/g, "")));
    });
    return matchedKey ? rawRow[matchedKey] : undefined;
  };
}
