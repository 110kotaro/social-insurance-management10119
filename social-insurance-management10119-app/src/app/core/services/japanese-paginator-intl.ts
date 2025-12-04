import { MatPaginatorIntl } from '@angular/material/paginator';

/**
 * 日本語対応のMatPaginatorIntl
 */
export class JapanesePaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = '1ページあたりの件数:';
  override nextPageLabel = '次のページ';
  override previousPageLabel = '前のページ';
  override firstPageLabel = '最初のページ';
  override lastPageLabel = '最後のページ';

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return `0 / ${length}件`;
    }

    length = Math.max(length, 0);
    const startIndex = page * pageSize;
    const endIndex = startIndex < length
      ? Math.min(startIndex + pageSize, length)
      : startIndex + pageSize;

    return `${startIndex + 1} - ${endIndex} / ${length}件`;
  };
}

