import { expect } from 'chai';
import { parseSlashCommand, getSlashCommands } from '../src/modules/hermes/SlashCommands';

describe('SlashCommands', () => {
  it('should return null for non-slash input', () => {
    expect(parseSlashCommand('hello world')).to.be.null;
  });

  it('should parse known slash commands', () => {
    const result = parseSlashCommand('/clear');
    expect(result).to.not.be.null;
    expect(result?.command.name).to.equal('clear');
  });

  it('should parse slash commands with arguments', () => {
    const result = parseSlashCommand('/search foo bar');
    expect(result).to.not.be.null;
    expect(result?.command.name).to.equal('search');
    expect(result?.args).to.equal('foo bar');
  });

  it('should handle unknown commands by returning a passthrough', () => {
    const result = parseSlashCommand('/unknown arg');
    expect(result).to.not.be.null;
    expect(result?.command.name).to.equal('unknown');
    expect(result?.args).to.equal('arg');
  });
});
