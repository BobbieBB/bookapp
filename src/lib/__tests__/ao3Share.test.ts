import { parseAo3Share } from '../ao3Share';

// In the format of AO3's Share text (20 Oct 2026). Invented work and author: we don't copy readers' fics into the repo.
const WIP =
  '<a href="https://archiveofourown.org/works/1000001"><strong>The Lantern Keeper</strong></a> (45000 words) by ' +
  '<a href="https://archiveofourown.org/users/inkwell_writer"><strong>inkwell_writer</strong></a><br />Chapters: 53/?<br />' +
  'Fandom: <a href="https://archiveofourown.org/tags/Harry%20Potter%20-%20J*d*%20K*d*%20Rowling">Harry Potter - J. K. Rowling</a><br />' +
  'Rating: Explicit<br />Warnings: Graphic Depictions Of Violence<br />Relationships: Hermione Granger/Draco Malfoy<br />' +
  'Characters: Hermione Granger, Draco Malfoy<br />Additional Tags: Slow Burn';

describe('parseAo3Share', () => {
  it('reads a WIP: link, title, author, chapters so far, fandom, rating, warnings, main ship', () => {
    expect(parseAo3Share(WIP)).toEqual({
      link: 'https://archiveofourown.org/works/1000001',
      title: 'The Lantern Keeper',
      author: 'inkwell_writer',
      fandom: 'Harry Potter - J. K. Rowling',
      ship: 'Hermione Granger/Draco Malfoy',
      complete: false,
      chapters: 53,
      rating: 'Explicit',
      warnings: ['Graphic Depictions Of Violence'],
    });
  });

  it('a complete fic, several warnings, co-authors and HTML entities', () => {
    const done =
      '<a href="https://archiveofourown.org/works/7"><strong>Tea &amp; Sympathy</strong></a> (5000 words) by ' +
      '<a href="https://archiveofourown.org/users/a"><strong>a</strong></a>, <a href="https://archiveofourown.org/users/b"><strong>b</strong></a><br />' +
      'Chapters: 12/12<br />Fandom: <a href="x">Good Omens (TV)</a>, <a href="y">Good Omens - Neil Gaiman &amp; Terry Pratchett</a><br />' +
      'Rating: Teen And Up Audiences<br />Warnings: Major Character Death, Graphic Depictions Of Violence<br />' +
      'Relationships: Aziraphale/Crowley (Good Omens), Anathema Device &amp; Newton Pulsifer';
    const p = parseAo3Share(done)!;
    expect(p.title).toBe('Tea & Sympathy');
    expect(p.author).toBe('a, b');
    expect(p.complete).toBe(true);
    expect(p.chapters).toBe(12);
    expect(p.fandom).toBe('Good Omens (TV)');
    expect(p.ship).toBe('Aziraphale/Crowley (Good Omens)');
    expect(p.warnings).toEqual(['Major Character Death', 'Graphic Depictions Of Violence']);
  });

  it('a plain link or other text is not Share text', () => {
    expect(parseAo3Share('https://archiveofourown.org/works/1000001')).toBeNull();
    expect(parseAo3Share('<a href="https://example.com/x">x</a>')).toBeNull();
  });
});
