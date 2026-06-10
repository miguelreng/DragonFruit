# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Test Settings"""

from .common import *  # noqa

DEBUG = True

# URL settings required by base_host() / auth views — not set by common.py
# when the corresponding env vars are absent.
WEB_URL = "http://localhost:3000"
APP_BASE_URL = "http://localhost:3000"
SPACE_BASE_URL = "http://localhost:3000"
ADMIN_BASE_URL = "http://localhost:3000"

# Send it in a dummy outbox
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Force get_configuration_value() to read from os.environ (not InstanceConfiguration)
# so test settings control auth feature flags without needing DB rows.
import os as _os  # noqa: E402

SKIP_ENV_VAR = False
_os.environ.setdefault("EMAIL_HOST", "localhost")
_os.environ.setdefault("ENABLE_MAGIC_LINK_LOGIN", "1")

INSTALLED_APPS.append(  # noqa
    "plane.tests"
)
