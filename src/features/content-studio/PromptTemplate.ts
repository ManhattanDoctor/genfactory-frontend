import { LanguageLocale } from '@ts-core/language';
import { parse, type Token } from '@messageformat/parser';

/** Prompt parameters and rendering use the same ICU syntax as ts-core/language. */
export class PromptTemplate {
  private static readonly language = new LanguageLocale('ru');

  private readonly numericVariables = new Set<string>();
  public readonly choices = new Map<string, Array<string>>();
  public readonly variables: Array<string>;

  public constructor(private readonly source: string) {
    const variables = new Set<string>();
    const visit = (tokens: Array<Token>): void => {
      for (const token of tokens) {
        if ('arg' in token) variables.add(token.arg);
        if (
          token.type === 'plural' ||
          token.type === 'selectordinal' ||
          (token.type === 'function' && token.key === 'number')
        ) {
          this.numericVariables.add(token.arg);
        }
        if (token.type === 'select')
          this.choices.set(
            token.arg,
            token.cases.map((item) => item.key),
          );
        if ('cases' in token) token.cases.forEach((item) => visit(item.tokens));
        if (token.type === 'function' && token.param) visit(token.param);
      }
    };
    visit(parse(source));
    this.variables = [...variables];
  }

  public isNumeric(key: string): boolean {
    return this.numericVariables.has(key);
  }

  public sourceParts(): Array<IPromptPart> {
    const tokens = parse(this.source);
    return tokens.map((token, index) => ({
      text: this.source.slice(token.ctx.offset, tokens[index + 1]?.ctx.offset),
      highlighted: token.type !== 'content',
    }));
  }

  public parts(values: Record<string, string | number>): Array<IPromptPart> {
    return this.sourceParts().map((part) => ({ ...part, text: new PromptTemplate(part.text).fill(values) }));
  }

  public fill(values: Record<string, string | number>): string {
    // Do not evaluate plural/select branches until their inputs have been supplied.
    if (this.variables.some((key) => values[key] === undefined || String(values[key]).trim() === ''))
      return this.source;
    for (const key of this.numericVariables) {
      if (!Number.isFinite(Number(values[key]))) throw new Error(`Expected a number for ${key}`);
    }
    const params: Record<string, string | number> = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
    );
    return String(PromptTemplate.language.compile(this.source, params));
  }
}

export interface IPromptPart {
  text: string;
  highlighted: boolean;
}
