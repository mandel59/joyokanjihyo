interface JoyoKanjiRecord {
  /** The page number of the page on which the subject appears */
  page: number;
  /** The subject character */
  subject: string;
  /**
   * Variant forms of the subject listed in the Kangxi dictionary
   *
   * `null` if the Kangxi form is almost the same as the subject.
   */
  kangxi: string[] | null;
  /** An acceptable form of the subject */
  acceptable: string | null;
  /** A reading of the subject */
  reading: string | null;
  /** Usage examples with the reading */
  examples: string[];
  /** A note on the subject */
  note: string;
}
const JoyoKanjiHyo: JoyoKanjiRecord[];
export = JoyoKanjiHyo;
