"use client";

import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MaewsaveMark } from "@/components/brand/maewsave-mark";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { CategoryIcon } from "@/components/ui/category-icon";
import type { CategoryType } from "@/db/finance-schema";
import type { SerializedCategory } from "@/domain/ledger-types";
import {
  CATEGORY_ICON_KEYS,
  type CategoryIconKey,
} from "@/lib/validation/finance";

interface CategoriesManagerProps {
  initialCategories: SerializedCategory[];
  locale: "th" | "en";
}

export function CategoriesManager({
  initialCategories,
  locale,
}: CategoriesManagerProps) {
  const router = useRouter();
  const t = useTranslations("categories");
  const tCommon = useTranslations("common");

  const [categories, setCategories] =
    useState<SerializedCategory[]>(initialCategories);
  const [activeTab, setActiveTab] = useState<CategoryType>("EXPENSE");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<SerializedCategory | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("EXPENSE");
  const [icon, setIcon] = useState<CategoryIconKey>("tag");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const visibleCategories = categories.filter((c) => c.type === activeTab);

  function openCreateSheet() {
    setEditingCategory(null);
    setName("");
    setType(activeTab);
    setIcon("tag");
    setConfirmingDelete(false);
    setFormError(null);
    setSheetOpen(true);
  }

  function openEditSheet(category: SerializedCategory) {
    setEditingCategory(category);
    setName(category.name);
    setType(category.type);
    const validIcon = (CATEGORY_ICON_KEYS as readonly string[]).includes(
      category.icon ?? "",
    )
      ? (category.icon as CategoryIconKey)
      : "tag";
    setIcon(validIcon);
    setConfirmingDelete(false);
    setFormError(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    if (isSubmitting) {
      return;
    }
    setSheetOpen(false);
    setConfirmingDelete(false);
    setFormError(null);
  }

  async function handleSeedStarter() {
    if (isSeeding) {
      return;
    }
    setIsSeeding(true);
    setListError(null);

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed", locale }),
      });

      if (!res.ok) {
        setListError(t("actionError"));
        return;
      }

      const data = (await res.json()) as { categories: SerializedCategory[] };
      setCategories(data.categories);
      router.refresh();
    } catch {
      setListError(t("actionError"));
    } finally {
      setIsSeeding(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 50) {
      setFormError(t("invalidNameError"));
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const url = editingCategory
        ? `/api/categories/${editingCategory.id}`
        : "/api/categories";
      const method = editingCategory ? "PATCH" : "POST";
      const body = editingCategory
        ? { name: trimmedName, icon }
        : { name: trimmedName, type, icon };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setFormError(t("actionError"));
        return;
      }

      const data = (await res.json()) as { category: SerializedCategory };
      if (editingCategory) {
        setCategories((prev) =>
          prev.map((item) =>
            item.id === data.category.id ? data.category : item,
          ),
        );
      } else {
        setCategories((prev) => [...prev, data.category]);
        setActiveTab(data.category.type);
      }

      setSheetOpen(false);
      router.refresh();
    } catch {
      setFormError(t("actionError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(category: SerializedCategory) {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setFormError(t("actionError"));
        return;
      }

      setCategories((prev) => prev.filter((item) => item.id !== category.id));
      setSheetOpen(false);
      router.refresh();
    } catch {
      setFormError(t("actionError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
          {t("sectionTitle")}
        </h2>
        <button
          type="button"
          onClick={openCreateSheet}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-elevated px-4 text-[14px] font-semibold text-text-primary transition-opacity active:opacity-85"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{t("addButton")}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["EXPENSE", "INCOME"] as const).map((tab) => {
          const selected = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              aria-pressed={selected}
              onClick={() => setActiveTab(tab)}
              className={`min-h-11 rounded-xl px-3 text-[14px] font-medium transition-colors ${
                selected
                  ? "bg-brand-accent text-brand-accent-fg"
                  : "bg-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab === "EXPENSE" ? t("expenseTab") : t("incomeTab")}
            </button>
          );
        })}
      </div>

      {listError && (
        <div
          role="alert"
          className="rounded-xl border border-status-expense bg-elevated px-4 py-3 text-[13px] text-status-expense"
        >
          {listError}
        </div>
      )}

      {categories.length === 0 ? (
        <div className="rounded-xl bg-elevated p-5 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-text-secondary">
            <MaewsaveMark size={28} decorative />
          </div>
          <div className="space-y-1">
            <p className="text-[15px] font-semibold text-text-primary">
              {t("emptyTitle")}
            </p>
            <p className="text-[13px] text-text-secondary">
              {t("emptyDescription")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              disabled={isSeeding}
              onClick={handleSeedStarter}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-accent px-4 text-[14px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>{isSeeding ? t("seedingButton") : t("seedButton")}</span>
            </button>
            <button
              type="button"
              onClick={openCreateSheet}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface px-4 text-[14px] font-medium text-text-primary"
            >
              {t("addButton")}
            </button>
          </div>
        </div>
      ) : visibleCategories.length === 0 ? (
        <div className="rounded-xl bg-elevated p-4 text-center space-y-2">
          <p className="text-[14px] text-text-secondary">{t("emptyTitle")}</p>
          <button
            type="button"
            onClick={openCreateSheet}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-surface px-4 text-[14px] font-medium text-brand-accent"
          >
            {t("addButton")}
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {visibleCategories.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-elevated px-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface ${
                    category.type === "INCOME"
                      ? "text-status-income"
                      : "text-text-primary"
                  }`}
                >
                  <CategoryIcon icon={category.icon} className="h-5 w-5" />
                </div>
                <span className="truncate text-[15px] font-medium text-text-primary">
                  {category.name}
                </span>
              </div>

              <button
                type="button"
                onClick={() => openEditSheet(category)}
                aria-label={`${tCommon("edit")} ${category.name}`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary transition-colors hover:text-text-primary"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={editingCategory ? t("editTitle") : t("createTitle")}
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-status-expense bg-elevated px-4 py-3 text-[13px] text-status-expense"
            >
              {formError}
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="category-name"
              className="block text-[13px] font-medium text-text-secondary"
            >
              {t("nameLabel")}
            </label>
            <input
              id="category-name"
              type="text"
              maxLength={50}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
              className="min-h-12 w-full rounded-xl border border-border-subtle bg-elevated px-4 text-base text-text-primary placeholder:text-text-muted"
            />
          </div>

          {!editingCategory && (
            <div className="space-y-2">
              <span className="block text-[13px] font-medium text-text-secondary">
                {t("typeLabel")}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(["EXPENSE", "INCOME"] as const).map((optionType) => {
                  const selected = type === optionType;
                  return (
                    <button
                      key={optionType}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setType(optionType)}
                      className={`min-h-11 rounded-xl px-3 text-[14px] font-medium transition-colors ${
                        selected
                          ? "bg-brand-accent text-brand-accent-fg"
                          : "bg-elevated text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {optionType === "EXPENSE"
                        ? t("expenseTab")
                        : t("incomeTab")}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <span className="block text-[13px] font-medium text-text-secondary">
              {t("iconLabel")}
            </span>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
              {CATEGORY_ICON_KEYS.map((iconKey, index) => {
                const selected = icon === iconKey;
                return (
                  <button
                    key={iconKey}
                    type="button"
                    aria-label={`${t("iconLabel")} ${index + 1}`}
                    aria-pressed={selected}
                    onClick={() => setIcon(iconKey)}
                    className={`flex h-11 w-full items-center justify-center rounded-xl transition-colors ${
                      selected
                        ? "bg-brand-accent text-brand-accent-fg"
                        : "bg-elevated text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <CategoryIcon icon={iconKey} className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-accent px-4 text-[15px] font-semibold text-brand-accent-fg transition-opacity active:opacity-85 disabled:opacity-60"
          >
            {isSubmitting ? tCommon("saving") : tCommon("save")}
          </button>

          {editingCategory && (
            <div className="border-t border-border-subtle pt-4">
              {confirmingDelete ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setConfirmingDelete(false)}
                    className="min-h-11 rounded-xl bg-elevated px-3 text-[14px] font-medium text-text-secondary"
                  >
                    {tCommon("cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleDelete(editingCategory)}
                    className="min-h-11 rounded-xl border border-status-expense bg-surface px-3 text-[14px] font-semibold text-status-expense"
                  >
                    {isSubmitting ? tCommon("deleting") : tCommon("confirmDelete")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setConfirmingDelete(true)}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-medium text-status-expense transition-colors hover:bg-elevated"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>{tCommon("delete")}</span>
                </button>
              )}
            </div>
          )}
        </form>
      </BottomSheet>
    </section>
  );
}
