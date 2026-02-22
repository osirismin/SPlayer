import request from "@/utils/request";

export interface ListenTogetherRoomInfo {
  creatorId: number;
  roomId: string;
}

export interface ListenTogetherCreateRoomResponse {
  type?: string;
  roomInfo?: ListenTogetherRoomInfo;
  code?: number;
  data?: unknown;
  message?: string;
}

export const listenTogetherCreateRoom = () => {
  return request<ListenTogetherCreateRoomResponse>({
    url: "/listentogether/room/create",
    method: "post",
    params: { timestamp: Date.now() },
  });
};

export const listenTogetherCheckRoom = (roomId: string) => {
  return request({
    url: "/listentogether/room/check",
    params: { roomId, timestamp: Date.now() },
  });
};

export const listenTogetherStatus = () => {
  return request({
    url: "/listentogether/status",
    params: { timestamp: Date.now() },
  });
};

export type ListenTogetherPlayMode = "ORDER_LOOP" | "RANDOM" | "SINGLE_LOOP";

export type ListenTogetherCommandType = "REPLACE" | "PLAYMODE_CHANGE";

export const listenTogetherSyncList = (payload: {
  roomId: string;
  commandType: ListenTogetherCommandType;
  version: { userId: number; version: number };
  playMode: ListenTogetherPlayMode;
  randomList?: string;
  displayList?: string;
}) => {
  return request({
    url: "/listentogether/sync/list",
    method: "post",
    params: { timestamp: Date.now() },
    data: payload,
  });
};

export const listenTogetherPlaylistGet = (roomId: string) => {
  return request({
    url: "/listentogether/sync/playlist/get",
    params: { roomId, timestamp: Date.now() },
  });
};

export type ListenTogetherPlayStatus = "PLAY" | "PAUSE";

export const listenTogetherHeartbeat = (payload: {
  roomId: string;
  songId: number;
  playStatus: ListenTogetherPlayStatus;
  progress: number;
}) => {
  return request({
    url: "/listentogether/heatbeat",
    method: "post",
    params: { timestamp: Date.now() },
    data: payload,
  });
};

export const listenTogetherEnd = (roomId: string) => {
  return request({
    url: "/listentogether/end",
    method: "post",
    params: { roomId, timestamp: Date.now() },
  });
};
