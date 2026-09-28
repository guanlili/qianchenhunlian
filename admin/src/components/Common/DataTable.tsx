import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  type Table as TanstackTable,
  type Updater,
  useReactTable,
} from "@tanstack/react-table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** 服务端分页 (可选): 传入后表格不做本地分页, 翻页回调由调用方接 skip/limit */
export interface ServerPagination {
  /** 服务端总数 (页脚展示与算页数) */
  total: number
  pageIndex: number
  pageSize: number
  onPageChange: (pageIndex: number) => void
  onPageSizeChange?: (pageSize: number) => void
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  meta?: Record<string, unknown>
  /** 整行可点 (手机端大点击区); 行内 a/button 的点击不受影响 */
  onRowClick?: (row: TData) => void
  /** 服务端分页; 不传则走本地分页 (默认每页 10 行, 仅适合小数据量) */
  pagination?: ServerPagination
}

export function DataTable<TData, TValue>({
  columns,
  data,
  meta,
  onRowClick,
  pagination,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(pagination
      ? {
          manualPagination: true,
          pageCount: Math.max(
            1,
            Math.ceil(pagination.total / pagination.pageSize),
          ),
          state: {
            pagination: {
              pageIndex: pagination.pageIndex,
              pageSize: pagination.pageSize,
            },
          },
          onPaginationChange: (updater: Updater<PaginationState>) => {
            const next =
              typeof updater === "function"
                ? updater({
                    pageIndex: pagination.pageIndex,
                    pageSize: pagination.pageSize,
                  })
                : updater
            if (next.pageSize !== pagination.pageSize) {
              // 改每页条数回到第一页, 避免越界空页
              pagination.onPageSizeChange?.(next.pageSize)
              pagination.onPageChange(0)
            } else if (next.pageIndex !== pagination.pageIndex) {
              pagination.onPageChange(next.pageIndex)
            }
          },
        }
      : { getPaginationRowModel: getPaginationRowModel() }),
    meta,
  })

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={
                  onRowClick
                    ? (e) => {
                        // 行内已有 a/button 的格子自己处理跳转/操作, 不重复触发
                        if ((e.target as HTMLElement).closest("a, button")) {
                          return
                        }
                        onRowClick(row.original)
                      }
                    : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="h-32 text-center text-muted-foreground"
              >
                暂无数据
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {pagination
        ? pagination.total > 0 && (
            <ServerPaginationFooter pagination={pagination} table={table} />
          )
        : table.getPageCount() > 1 && (
            <ClientPaginationFooter table={table} rowCount={data.length} />
          )}
    </div>
  )
}

function ServerPaginationFooter<TData>({
  pagination,
  table,
}: {
  pagination: ServerPagination
  table: TanstackTable<TData>
}) {
  const { pageIndex, pageSize, total } = pagination
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-t bg-muted/20">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="text-sm text-muted-foreground">
          显示 {pageIndex * pageSize + 1} 至{" "}
          {Math.min((pageIndex + 1) * pageSize, total)} 条 (共 {total} 条)
        </div>
        <div className="flex items-center gap-x-2">
          <p className="text-sm text-muted-foreground">每页条数</p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              table.options.onPaginationChange?.({
                pageIndex: 0,
                pageSize: Number(value),
              })
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={`${n}`}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-x-6">
        <div className="flex items-center gap-x-1 text-sm text-muted-foreground">
          <span>第</span>
          <span className="font-medium text-foreground">{pageIndex + 1}</span>
          <span>页 /</span>
          <span className="font-medium text-foreground">{pageCount}</span>
          <span>页</span>
        </div>

        <div className="flex items-center gap-x-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => pagination.onPageChange(0)}
            disabled={pageIndex === 0}
          >
            <span className="sr-only">前往第一页</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => pagination.onPageChange(pageIndex - 1)}
            disabled={pageIndex === 0}
          >
            <span className="sr-only">上一页</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => pagination.onPageChange(pageIndex + 1)}
            disabled={pageIndex >= pageCount - 1}
          >
            <span className="sr-only">下一页</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => pagination.onPageChange(pageCount - 1)}
            disabled={pageIndex >= pageCount - 1}
          >
            <span className="sr-only">前往最后一页</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function ClientPaginationFooter<TData>({
  table,
  rowCount,
}: {
  table: TanstackTable<TData>
  rowCount: number
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-t bg-muted/20">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="text-sm text-muted-foreground">
          共 {rowCount} 条，显示{" "}
          {table.getState().pagination.pageIndex *
            table.getState().pagination.pageSize +
            1}{" "}
          至{" "}
          {Math.min(
            (table.getState().pagination.pageIndex + 1) *
              table.getState().pagination.pageSize,
            rowCount,
          )}{" "}
          条
        </div>
        <div className="flex items-center gap-x-2">
          <p className="text-sm text-muted-foreground">每页条数</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[5, 10, 25, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-x-6">
        <div className="flex items-center gap-x-1 text-sm text-muted-foreground">
          <span>第</span>
          <span className="font-medium text-foreground">
            {table.getState().pagination.pageIndex + 1}
          </span>
          <span>页 /</span>
          <span className="font-medium text-foreground">
            {table.getPageCount()}
          </span>
          <span>页</span>
        </div>

        <div className="flex items-center gap-x-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">前往第一页</span>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">上一页</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">下一页</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">前往最后一页</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
