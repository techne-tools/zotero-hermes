import { expect } from "chai";
import {
  parseSlashCommand,
  getSlashCommands,
} from "../src/modules/hermes/SlashCommands";

describe("SlashCommands", function () {
  it("should return null for non-slash input", function () {
    expect(parseSlashCommand("hello world")).to.be.null;
  });

  it("should parse known slash commands", function () {
    const result = parseSlashCommand("/clear");
    expect(result).to.not.be.null;
    expect(result?.command.name).to.equal("clear");
  });

  it("should parse slash commands with arguments", function () {
    const result = parseSlashCommand("/search foo bar");
    expect(result).to.not.be.null;
    expect(result?.command.name).to.equal("search");
    expect(result?.args).to.equal("foo bar");
  });

  it("should handle unknown commands by returning a passthrough", function () {
    const result = parseSlashCommand("/unknown arg");
    expect(result).to.not.be.null;
    expect(result?.command.name).to.equal("unknown");
    expect(result?.args).to.equal("arg");
  });

  it("should have export command registered", function () {
    const commands = getSlashCommands();
    const exportCmd = commands.find((c) => c.name === "export");
    expect(exportCmd).to.exist;
    expect(exportCmd?.description).to.include("Markdown");
  });

  it("should have collection, compare, gaps, and draft-litreview registered", function () {
    const commands = getSlashCommands();
    const names = commands.map((c) => c.name);
    expect(names).to.include("collection");
    expect(names).to.include("compare");
    expect(names).to.include("gaps");
    expect(names).to.include("draft-litreview");
  });

  it("should have Round 3 commands registered: canvas, organize-tags, timeline, critique, and quiz", function () {
    const commands = getSlashCommands();
    const names = commands.map((c) => c.name);
    expect(names).to.include("canvas");
    expect(names).to.include("organize-tags");
    expect(names).to.include("timeline");
    expect(names).to.include("critique");
    expect(names).to.include("quiz");
  });
});
