import {
  InteractionContextType,
  Locale,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerAccessDeniedError } from "../../Ownership/Error/OwnerAccessDeniedError.js";
import { TriggerListItemDto } from "../../Voice/Dto/TriggerListItemDto.js";
import { VoiceListDto } from "../../Voice/Dto/VoiceListDto.js";
import { CommandAccessError } from "../Error/CommandAccessError.js";
import { CommandListService } from "./CommandListService.js";
import { CommandReplyService } from "./CommandReplyService.js";

import type {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionEditReplyOptions,
} from "discord.js";
import type { OwnershipService } from "../../Ownership/Service/OwnershipService.js";
import type { CommandTargetService } from "./CommandTargetService.js";

describe("localized list snapshots and pagination access", () => {
  afterEach(() => vi.restoreAllMocks());

  const snapshot = () =>
    new VoiceListDto(
      [
        ...Array.from(
          { length: 90 },
          (_, index) =>
            new TriggerListItemDto(String(100000000000000000n + BigInt(index)), true, null, 1),
        ),
        new TriggerListItemDto("299999999999999999", false, 3, 2),
      ],
      93,
      3,
      ["399999999999999999"],
      100,
    );

  const setup = () => {
    const ownership = { assertOwner: vi.fn(async (_userId: string) => {}) };
    const targets = { guild: vi.fn() };

    const service = new CommandListService(
      new CommandReplyService(),
      ownership as unknown as OwnershipService,
      targets as unknown as CommandTargetService,
    );

    const interaction = {
      user: { id: "owner" },
      locale: Locale.Russian,
      deferred: true,
      replied: false,
      inGuild: () => false,
      editReply: vi.fn(async (_message: InteractionEditReplyOptions) => ({})),
    };

    return { service, ownership, interaction };
  };

  const click = (userId = "owner", guild = false) => {
    const interaction = {
      user: { id: userId },
      locale: Locale.Russian,
      context: guild ? InteractionContextType.Guild : InteractionContextType.BotDM,
      guildId: guild ? "guild" : null,
      memberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
      deferred: false,
      replied: false,
      inGuild: () => guild,
      editReply: vi.fn(async (_message: InteractionEditReplyOptions) => ({})),
      reply: vi.fn(async (_message: unknown) => ({})),
      deferUpdate: vi.fn(async () => {
        interaction.deferred = true;
      }),
    };

    return interaction;
  };

  const nextButton = (message: InteractionEditReplyOptions) => {
    const row = message.components![0] as ActionRowBuilder<ButtonBuilder>;
    const button = row.components[1].toJSON();

    if (!("custom_id" in button)) {
      throw new Error("The next-page button requires a custom ID.");
    }

    const [, id, page] = button.custom_id.split("/");

    return { id, page, disabled: button.disabled };
  };

  const next = async (setupResult: ReturnType<typeof setup>, owner = true) => {
    await setupResult.service.show(
      setupResult.interaction as unknown as ChatInputCommandInteraction,
      "guild",
      owner,
      snapshot(),
    );

    const message = setupResult.interaction.editReply.mock.calls[0][0];

    return { ...nextButton(message), message };
  };

  it("splits long lists within Discord limits, retains inactive limits and manual-deletion mentions", async () => {
    const context = setup();
    const { message, ...navigation } = await next(context);
    expect(message.content).toContain("Всего комнат: 93");
    expect(message.content!.length).toBeLessThanOrEqual(2000);
    const button = click();

    while (!navigation.disabled) {
      await context.service.turn(
        button as unknown as ButtonInteraction,
        navigation.id,
        navigation.page,
      );

      Object.assign(navigation, nextButton(button.editReply.mock.lastCall![0]));
    }

    const pages = button.editReply.mock.calls.map(([page]) => page.content!).join("\n");
    expect(pages).toContain("Неактивные триггеры");
    expect(pages).toContain("<#299999999999999999>");
    expect(pages).toContain("Комнаты без активного триггера: 3");
    expect(pages).toContain("<#399999999999999999>");
    expect(button.editReply.mock.calls.every(([page]) => page.content!.length <= 2000)).toBe(true);
    expect(context.ownership.assertOwner).toHaveBeenCalled();
  });

  it("hides owner-only statistics from the guild list and rechecks ManageGuild on clicks", async () => {
    const context = setup();
    const navigation = await next(context, false);
    const button = click("owner", true);

    while (!navigation.disabled) {
      await context.service.turn(
        button as unknown as ButtonInteraction,
        navigation.id,
        navigation.page,
      );

      Object.assign(navigation, nextButton(button.editReply.mock.lastCall![0]));
    }

    const pages = context.interaction.editReply.mock.calls
      .concat(button.editReply.mock.calls)
      .map(([page]) => page.content!)
      .join("\n");

    expect(pages).not.toContain("Всего комнат");
    expect(pages).not.toContain("Неактивные триггеры");
    expect(pages).toContain("Комнаты без активного триггера: 3");
    button.memberPermissions = new PermissionsBitField();
    button.editReply.mockClear();

    await expect(
      context.service.turn(button as unknown as ButtonInteraction, navigation.id, navigation.page),
    ).rejects.toBeInstanceOf(CommandAccessError);

    expect(button.editReply).not.toHaveBeenCalled();
  });

  it("shows the same target page for concurrent clicks on the same button", async () => {
    const context = setup();
    const { id, page } = await next(context);
    const first = click();
    const second = click();

    await Promise.all([
      context.service.turn(first as unknown as ButtonInteraction, id, page),
      context.service.turn(second as unknown as ButtonInteraction, id, page),
    ]);

    const message = first.editReply.mock.calls[0][0];
    expect(second.editReply.mock.calls[0][0]).toEqual(message);
    expect(nextButton(message).page).toBe("2");
    expect(context.ownership.assertOwner).toHaveBeenCalledTimes(2);
  });

  it.each(["-1", "1.5", "NaN", "999"])("rejects invalid target page %s", async (page) => {
    const context = setup();
    const { id } = await next(context);
    const button = click();

    await expect(
      context.service.turn(button as unknown as ButtonInteraction, id, page),
    ).rejects.toBeInstanceOf(CommandAccessError);

    expect(button.editReply).not.toHaveBeenCalled();
  });

  it("does not let a different caller navigate the author's snapshot", async () => {
    const context = setup();
    const { id, page } = await next(context);
    const button = click("outsider");

    await expect(
      context.service.turn(button as unknown as ButtonInteraction, id, page),
    ).rejects.toBeInstanceOf(CommandAccessError);

    expect(button.deferUpdate).not.toHaveBeenCalled();
    expect(button.editReply).not.toHaveBeenCalled();
  });

  it("does not show another page after ownership was revoked", async () => {
    const context = setup();
    const { id, page } = await next(context);
    context.ownership.assertOwner.mockRejectedValueOnce(new OwnerAccessDeniedError());
    const button = click();

    await expect(
      context.service.turn(button as unknown as ButtonInteraction, id, page),
    ).rejects.toBeInstanceOf(OwnerAccessDeniedError);

    expect(button.editReply).not.toHaveBeenCalled();
  });

  it("expires at 15 minutes without extending the deadline on navigation", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const context = setup();
    const { id, page } = await next(context);
    now = 14 * 60 * 1000;
    await context.service.turn(click() as unknown as ButtonInteraction, id, page);
    now = 15 * 60 * 1000;
    const button = click();
    await context.service.turn(button as unknown as ButtonInteraction, id, page);

    expect(button.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Сессия списка недействительна"),
      }),
    );

    expect(button.editReply).not.toHaveBeenCalled();
  });

  it("rejects old buttons after process state is lost", async () => {
    const original = setup();
    const { id, page } = await next(original);
    const restarted = setup();
    const button = click();
    await restarted.service.turn(button as unknown as ButtonInteraction, id, page);

    expect(button.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Сессия списка недействительна"),
      }),
    );
  });

  it("uses English for non-Russian locales", async () => {
    const context = setup();
    context.interaction.locale = Locale.German;

    await context.service.show(
      context.interaction as unknown as ChatInputCommandInteraction,
      "guild",
      false,
      new VoiceListDto([], 0, 0, [], null),
    );

    expect(context.interaction.editReply.mock.calls[0][0].content).toContain("Active triggers");
    expect(context.interaction.editReply.mock.calls[0][0].components).toEqual([]);
  });
});
