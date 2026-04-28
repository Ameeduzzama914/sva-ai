export interface ProviderGenerateInput {
  prompt: string;
}

export interface ProviderGenerateResult {
  ok: true;
  text: string;
}

export interface ProviderGenerateError {
  ok: false;
  message: string;
  reason: "not_configured" | "request_failed" | "parse_failed";
}

export type ProviderResponse = ProviderGenerateResult | ProviderGenerateError;

export interface TextProvider {
  name: string;
  generate(input: ProviderGenerateInput): Promise<ProviderResponse>;
}
