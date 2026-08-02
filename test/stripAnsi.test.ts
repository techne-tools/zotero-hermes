import { expect } from 'chai';
import { stripAnsi } from '../src/utils/stripAnsi';

describe('stripAnsi', () => {
  it('should remove standard ANSI color codes', () => {
    const input = '\u001b[31mRed Text\u001b[0m';
    expect(stripAnsi(input)).to.equal('Red Text');
  });

  it('should remove multiple complex sequences', () => {
    const input = '\u001b[1;32mBold Green\u001b[0m and \u001b[4mUnderline\u001b[0m';
    expect(stripAnsi(input)).to.equal('Bold Green and Underline');
  });

  it('should handle strings without ANSI codes', () => {
    const input = 'Plain text';
    expect(stripAnsi(input)).to.equal('Plain text');
  });
});
