/** A message: plain text, or plural forms ("one" for exactly 1, "other" otherwise; see pluralForm). */
export type Message = string | ({ other: string } & { one?: string });

export type Messages = Record<string, Message>;

/** The Bulgarian side of a namespace: exactly the English keys, each translated. */
export type Translation<T extends Messages> = { [K in keyof T]: Message };
