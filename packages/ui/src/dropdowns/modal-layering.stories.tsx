import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { EModalWidth, ModalCore } from "../modals";
import { CustomSearchSelect } from "./custom-search-select";
import { CustomSelect } from "./custom-select";

const SEARCH_OPTIONS = [
  { content: "Text", query: "Text", value: "text" },
  { content: "Number", query: "Number", value: "number" },
  { content: "Single select", query: "Single select", value: "select" },
];

function ModalLayeringExample() {
  const [isOpen, setIsOpen] = useState(true);
  const [fieldType, setFieldType] = useState("text");
  const [searchFieldType, setSearchFieldType] = useState("text");

  return (
    <div className="min-h-96 bg-surface-2 p-8">
      <button
        type="button"
        className="rounded-lg border border-strong bg-surface-1 px-3 py-2 text-13 text-primary"
        onClick={() => setIsOpen(true)}
      >
        Open modal
      </button>

      <ModalCore isOpen={isOpen} handleClose={() => setIsOpen(false)} width={EModalWidth.LG}>
        <div className="space-y-5 p-5">
          <div>
            <h2 className="text-16 font-medium text-primary">Dropdown layering check</h2>
            <p className="mt-1 text-13 text-secondary">
              Both portaled option panels must render above the modal backdrop and remain clickable.
            </p>
          </div>

          <div className="block space-y-1.5">
            <span className="text-13 font-medium text-secondary">Custom select</span>
            <CustomSelect
              value={fieldType}
              onChange={setFieldType}
              input
              label={SEARCH_OPTIONS.find((option) => option.value === fieldType)?.content}
              buttonClassName="w-full"
              optionsClassName="w-[var(--reference-width)]"
            >
              {SEARCH_OPTIONS.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.content}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>

          <div className="block space-y-1.5">
            <span className="text-13 font-medium text-secondary">Search select</span>
            <CustomSearchSelect
              value={searchFieldType}
              onChange={setSearchFieldType}
              options={SEARCH_OPTIONS}
              input
              label={SEARCH_OPTIONS.find((option) => option.value === searchFieldType)?.content}
              buttonClassName="w-full"
              optionsClassName="w-[var(--reference-width)]"
            />
          </div>
        </div>
      </ModalCore>
    </div>
  );
}

const meta = {
  title: "Dropdowns/Modal layering",
  component: ModalLayeringExample,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ModalLayeringExample>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
