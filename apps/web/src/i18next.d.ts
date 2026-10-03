import "i18next";
import type account from "./locales/en/account.json";
import type admin from "./locales/en/admin.json";
import type common from "./locales/en/common.json";
import type issues from "./locales/en/issues.json";
import type mergeRequests from "./locales/en/mergeRequests.json";
import type repository from "./locales/en/repository.json";
import type settings from "./locales/en/settings.json";
import type shell from "./locales/en/shell.json";
import type workspace from "./locales/en/workspace.json";

// Keys are checked against the English catalogs at compile time.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      account: typeof account;
      admin: typeof admin;
      common: typeof common;
      issues: typeof issues;
      mergeRequests: typeof mergeRequests;
      repository: typeof repository;
      settings: typeof settings;
      shell: typeof shell;
      workspace: typeof workspace;
    };
  }
}
