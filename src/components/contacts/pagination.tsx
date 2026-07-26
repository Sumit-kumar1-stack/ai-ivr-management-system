"use client";

import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  isLoading?: boolean;

  onPageChange:
    (
      page: number
    ) => void;

  onLimitChange:
    (
      limit: number
    ) => void;
}

export default function Pagination({
  page,
  limit,
  total,
  totalPages,
  isLoading = false,
  onPageChange,
  onLimitChange,
}: PaginationProps) {
  if (
    total === 0
  ) {
    return null;
  }

  const firstItem =
    (page - 1) *
      limit +
    1;

  const lastItem =
    Math.min(
      page * limit,
      total
    );

  const safeTotalPages =
    Math.max(
      totalPages,
      1
    );

  return (
    <div
      className="
        flex
        flex-col
        gap-4
        rounded-xl
        border
        bg-card
        p-4
        sm:flex-row
        sm:items-center
        sm:justify-between
      "
    >
      <p
        className="
          text-sm
          text-muted-foreground
        "
      >
        Showing{" "}
        <span className="font-medium text-foreground">
          {firstItem}
        </span>
        {" – "}
        <span className="font-medium text-foreground">
          {lastItem}
        </span>
        {" of "}
        <span className="font-medium text-foreground">
          {total}
        </span>{" "}
        contacts
      </p>

      <div
        className="
          flex
          flex-wrap
          items-center
          gap-3
        "
      >
        <label
          className="
            flex
            items-center
            gap-2
            text-sm
            text-muted-foreground
          "
        >
          Rows

          <select
            value={
              limit
            }
            disabled={
              isLoading
            }
            onChange={
              (
                event
              ) =>
                onLimitChange(
                  Number(
                    event.target
                      .value
                  )
                )
            }
            className="
              h-9
              rounded-md
              border
              border-input
              bg-background
              px-2
              text-sm
              text-foreground
            "
          >
            <option value={10}>
              10
            </option>

            <option value={20}>
              20
            </option>

            <option value={50}>
              50
            </option>

            <option value={100}>
              100
            </option>
          </select>
        </label>

        <span
          className="
            min-w-24
            text-center
            text-sm
            text-muted-foreground
          "
        >
          Page {page} of{" "}
          {safeTotalPages}
        </span>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            isLoading ||
            page <= 1
          }
          onClick={
            () =>
              onPageChange(
                page - 1
              )
          }
        >
          <ChevronLeft
            className="
              mr-1
              h-4
              w-4
            "
          />

          Previous
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            isLoading ||
            page >=
              safeTotalPages
          }
          onClick={
            () =>
              onPageChange(
                page + 1
              )
          }
        >
          Next

          <ChevronRight
            className="
              ml-1
              h-4
              w-4
            "
          />
        </Button>
      </div>
    </div>
  );
}