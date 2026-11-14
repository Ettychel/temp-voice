import type { TriggerChannelDto } from "../../Triggers/Dto/TriggerChannelDto.js";
import type { VoiceChannelState } from "../Enum/VoiceChannelState.js";
import type { VoiceChannelMutationError } from "../Error/VoiceChannelMutationError.js";
import type { VoiceChannelUnavailableError } from "../Error/VoiceChannelUnavailableError.js";

export interface VoiceChannelGatewayInterface {
  /**
   * Reads fresh channel facts for the requested guild after the scenario enters its queue.
   * @throws {Promise<VoiceChannelUnavailableError>} The channel cannot be reliably read.
   */
  getTriggerChannel(guildId: string, channelId: string): Promise<TriggerChannelDto>;

  /** @throws {Promise<VoiceChannelUnavailableError>} The current member position is unknown. */
  isMemberInChannel(guildId: string, userId: string, channelId: string): Promise<boolean>;

  /**
   * Creates a GuildVoice copy using current settings, creator name and required overwrites.
   * @throws {Promise<VoiceChannelMutationError>} Discord creation failed.
   * @throws {Promise<VoiceChannelUnavailableError>} Current source/member data is unavailable.
   */
  createChannel(guildId: string, triggerChannelId: string, userId: string): Promise<string>;

  /** @throws {Promise<VoiceChannelMutationError>} Moving the member failed. */
  moveMember(guildId: string, userId: string, channelId: string): Promise<void>;

  /**
   * Empty means reliable absence of ordinary users; bots alone do not prevent deletion.
   * Missing requires confirmed absence, not cache omission or loss of access.
   * @throws {Promise<VoiceChannelUnavailableError>} Reliable channel state cannot be obtained.
   */
  getChannelState(guildId: string, channelId: string): Promise<VoiceChannelState>;

  /**
   * One scenario attempt; confirmed Discord absence also counts as successful deletion.
   * @throws {Promise<VoiceChannelMutationError>} Discord deletion failed.
   */
  deleteChannel(guildId: string, channelId: string): Promise<void>;
}
