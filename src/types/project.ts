export interface Project {
  id: string;
  name: string;
  memo: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activeDbId?: string; // 有効バージョンとして設定されたロケットDB ID
}
