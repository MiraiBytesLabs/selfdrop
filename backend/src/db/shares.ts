import db from "./index.js";
import { generateToken } from "../utils/token.js";

type CreateShareParams = {
  uuid: string;
  filePaths: string[];
  expiresAt: string;
  downloadLimit: number | null;
  passwordHash: string | null;
  maskFilenames: boolean;
  name: string | null;
};

export interface IShareRow {
  id: number;
  uuid: string;
  download_limit: number | null;
  download_count: number;
  password_hash: string | null;
  expires_at: string;
  created_at: string;
  mask_filenames: number;
  name: string | null;
}

export interface IFileDTO {
  uuid: string;
  file_path: string;
}

export interface IShareSummary
  extends Omit<IShareRow, "password_hash" | "mask_filenames"> {
  password_hash?: undefined;
  hasPassword: boolean;
  maskFilenames: boolean;
}

export interface IShareDTO extends IShareSummary {
  files: IFileDTO[];
  filePaths: string[];
}

export type ValidateShareResult =
  | { valid: false; reason: "not_found" | "expired" | "limit_reached" }
  | { valid: true; share: IShareDTO };

export const createShare = db.transaction((params: CreateShareParams) => {
  const {
    uuid,
    filePaths,
    expiresAt,
    downloadLimit,
    passwordHash,
    maskFilenames,
    name,
  } = params;

  const { lastInsertRowid } = db
    .prepare(
      `
    INSERT INTO shares (uuid, expires_at, download_limit, password_hash, mask_filenames, name)
    VALUES (@uuid, @expiresAt, @downloadLimit, @passwordHash, @maskFilenames, @name)
  `,
    )
    .run({
      uuid,
      expiresAt,
      downloadLimit: downloadLimit ?? null,
      passwordHash: passwordHash ?? null,
      maskFilenames: maskFilenames ? 1 : 0,
      name: name ?? null,
    });

  const insertFile = db.prepare(
    "INSERT INTO share_files (share_id, file_path, uuid) VALUES (@shareId, @filePath, @fileUUID)",
  );
  for (const filePath of filePaths) {
    const fileUUID = generateToken();
    insertFile.run({ shareId: lastInsertRowid, filePath, fileUUID });
  }

  return getShareById(Number(lastInsertRowid));
});

export function getShareById(id: number): IShareSummary | null {
  const share = db
    .prepare("SELECT * FROM shares WHERE id = ?")
    .get(id) as IShareRow | undefined;
  return share ? attachFiles(share, false) : null;
}

export function getShareByUuid(uuid: string): IShareDTO | null {
  const share = db
    .prepare("SELECT * FROM shares WHERE uuid = ?")
    .get(uuid) as IShareRow | undefined;
  return share ? attachFiles(share) : null;
}

export function listShares(): IShareDTO[] {
  return db
    .prepare("SELECT * FROM shares ORDER BY created_at DESC")
    .all()
    .map((share) => attachFiles(share as IShareRow));
}

export function incrementDownloadCount(uuid: string) {
  db.prepare(
    "UPDATE shares SET download_count = download_count + 1 WHERE uuid = ?",
  ).run(uuid);
}

export function deleteShare(uuid: string): boolean {
  const { changes } = db.prepare("DELETE FROM shares WHERE uuid = ?").run(uuid);
  return changes > 0;
}

export function validateShare(uuid: string): ValidateShareResult {
  const share = getShareByUuid(uuid);
  if (!share) return { valid: false, reason: "not_found" };
  if (new Date() > new Date(share.expires_at))
    return { valid: false, reason: "expired" };
  if (
    share.download_limit !== null &&
    share.download_count >= share.download_limit
  ) {
    return { valid: false, reason: "limit_reached" };
  }
  return { valid: true, share };
}

function attachFiles(share: IShareRow, sendFileDetails: false): IShareSummary;
function attachFiles(share: IShareRow, sendFileDetails?: true): IShareDTO;
function attachFiles(
  share: IShareRow,
  sendFileDetails = true,
): IShareSummary | IShareDTO {
  const files = db
    .prepare(
      "SELECT file_path, uuid FROM share_files WHERE share_id = ? ORDER BY id ASC",
    )
    .all(share.id) as IFileDTO[];

  const shareDetails: IShareSummary = {
    ...share,
    password_hash: undefined,
    hasPassword: share.password_hash !== null,
    maskFilenames: share.mask_filenames === 1,
    name: share.name ?? null,
  };

  if (sendFileDetails) {
    return {
      ...shareDetails,
      filePaths: files.map((f) => f.file_path),
      files,
    };
  }

  return shareDetails;
}
