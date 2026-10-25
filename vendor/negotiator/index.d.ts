declare namespace Negotiator {
  interface DetailedMediaType {
    type: string;
    parameters: { [name: string]: string };
    q: number;
  }
}

declare class Negotiator {
  constructor(request: { headers: { [name: string]: string | undefined } });
  charset(available?: string[]): string | undefined;
  charsets(available?: string[]): string[];
  encoding(available?: string[]): string | undefined;
  encodings(available?: string[]): string[];
  language(available?: string[]): string | undefined;
  languages(available?: string[]): string[];
  mediaType(available: string[] | undefined, options: { detailed: true }): Negotiator.DetailedMediaType | undefined;
  mediaType(available?: string[], options?: { detailed?: false }): string | undefined;
  mediaTypes(available: string[] | undefined, options: { detailed: true }): Negotiator.DetailedMediaType[];
  mediaTypes(available?: string[], options?: { detailed?: false }): string[];
  preferredCharset: Negotiator["charset"];
  preferredCharsets: Negotiator["charsets"];
  preferredEncoding: Negotiator["encoding"];
  preferredEncodings: Negotiator["encodings"];
  preferredLanguage: Negotiator["language"];
  preferredLanguages: Negotiator["languages"];
  preferredMediaType: Negotiator["mediaType"];
  preferredMediaTypes: Negotiator["mediaTypes"];
}

export = Negotiator;
