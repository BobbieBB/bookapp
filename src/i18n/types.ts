/** A message: plain text, or plural forms picked with Intl.PluralRules for the language. */
export type Message = string | ({ other: string } & Partial<Record<Intl.LDMLPluralRule, string>>);

export type Messages = Record<string, Message>;

/** The Bulgarian side of a namespace: exactly the English keys, each translated. */
export type Translation<T extends Messages> = { [K in keyof T]: Message };
