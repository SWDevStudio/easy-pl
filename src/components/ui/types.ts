export interface TableColumn<TItem = unknown> {
  key: string;
  label?: string;
  field?: keyof TItem | ((item: TItem) => unknown);
  sortable?: boolean;
  sortValue?: (item: TItem) => string | number | boolean | null;
  width?: string;
  class?: string;
  headerClass?: string;
}
