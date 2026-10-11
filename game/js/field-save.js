// Lossless run-length packing for repeated tile values. Keep the old shape
// when packing would be larger; the decoder also accepts all legacy arrays.
export function encodeTileValues(values) {
  const runs = [];
  for (let i = 0; i < values.length;) {
    const value = values[i];
    let end = i + 1;
    while (end < values.length && values[end] === value) end++;
    runs.push(end - i, value);
    i = end;
  }
  const packed = { rle: 1, length: values.length, runs };
  return JSON.stringify(packed).length < JSON.stringify(values).length ? packed : values;
}

export function decodeTileValues(saved, count) {
  if (Array.isArray(saved) || typeof saved === 'string') return saved.length === count ? saved : null;
  if (!saved || saved.rle !== 1 || saved.length !== count || !Array.isArray(saved.runs) ||
      saved.runs.length % 2 || saved.runs.length > count * 2) return null;
  const values = new Array(count);
  let index = 0;
  for (let i = 0; i < saved.runs.length; i += 2) {
    const length = saved.runs[i], value = saved.runs[i + 1];
    if (!Number.isSafeInteger(length) || length <= 0 || length > count - index ||
        (typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'number' && !Number.isFinite(value))) return null;
    values.fill(value, index, index + length);
    index += length;
  }
  return index === count ? values : null;
}
