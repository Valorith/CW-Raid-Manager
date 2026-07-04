export function redactRequestLogUrl(url: string): string {
  return url.replace(/(\/api\/webhook-inbox\/[^/?#]+\/)[^/?#]+/g, '$1:redacted');
}
