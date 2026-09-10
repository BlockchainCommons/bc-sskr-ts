/**
 * Limits and the share header size. Wire: they bound what a share can carry.
 *
 * @module constants
 */
import {
  MIN_SECRET_LENGTH as SHAMIR_MIN,
  MAX_SECRET_LENGTH as SHAMIR_MAX,
  MAX_SHARE_COUNT as SHAMIR_MAX_SHARES,
} from "@blockchaincommons/shamir";

/** Shortest secret, in bytes (shamir's). */
export const MIN_SECRET_LENGTH: number = SHAMIR_MIN;
/** Longest secret, in bytes (shamir's). */
export const MAX_SECRET_LENGTH: number = SHAMIR_MAX;
/** Most members in a group (shamir's share limit). */
export const MAX_SHARE_COUNT: number = SHAMIR_MAX_SHARES;
/** Most groups in a spec. */
export const MAX_GROUP_COUNT: number = SHAMIR_MAX_SHARES;
/** Bytes before a share's value: identifier (2), group threshold/count, group index/member threshold, member index. */
export const SHARE_HEADER_LENGTH = 5;
/** Shortest serialized share. */
export const MIN_SHARE_LENGTH: number = SHARE_HEADER_LENGTH + SHAMIR_MIN;
