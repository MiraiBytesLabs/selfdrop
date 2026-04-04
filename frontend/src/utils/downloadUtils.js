export function getUrl(file, uuid, hasPassword = false, isPreview = false) {
  let url = "";

  const requestMode = isPreview ? "preview" : "file";

  if (hasPassword) {
    const signedUrl = isPreview
      ? file.signedUrl.replace(/(\/s\/[0-9a-fA-F-]+\/)file(\/)/, "$1preview$2")
      : file.signedUrl;
    url = signedUrl;
  } else {
    // url = `/s/${uuid}/${requestMode}/${encodeURIComponent(file.filename)}`;
    url = `/s/${uuid}/${requestMode}/${encodeURIComponent(file.uuid)}`;
  }
  return url;
}
