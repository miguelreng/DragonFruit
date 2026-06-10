# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for validate_mcp_server_url (SSRF guard).

All reject cases use IP-literal URLs so no DNS is needed. The single
accept case monkeypatches socket.getaddrinfo to return a public IP
tuple, also avoiding DNS.
"""

import pytest

from plane.llm.mcp_client import MCPClientError, validate_mcp_server_url


@pytest.mark.unit
class TestValidateMcpServerUrl:
    def test_accepts_public_https_url(self, monkeypatch):
        """A well-formed https URL that resolves to a public IP is accepted."""

        def fake_getaddrinfo(host, port, *args, **kwargs):
            # Simulate resolving example.com → 93.184.216.34 (public)
            return [(2, 1, 6, "", ("93.184.216.34", 0))]

        monkeypatch.setattr("plane.llm.mcp_client.socket.getaddrinfo", fake_getaddrinfo)
        result = validate_mcp_server_url("https://example.com/mcp")
        assert result == "https://example.com/mcp"

    def test_rejects_localhost(self):
        """http://localhost must be rejected (loopback)."""
        with pytest.raises(MCPClientError):
            validate_mcp_server_url("http://localhost:6379")

    def test_rejects_loopback_ip(self):
        """http://127.0.0.1 must be rejected (loopback)."""
        with pytest.raises(MCPClientError):
            validate_mcp_server_url("http://127.0.0.1/")

    def test_rejects_link_local_metadata(self):
        """http://169.254.169.254 must be rejected (link-local / cloud metadata)."""
        with pytest.raises(MCPClientError):
            validate_mcp_server_url("http://169.254.169.254/latest/meta-data/")

    def test_rejects_private_ip(self):
        """http://10.0.0.5 must be rejected (RFC-1918 private)."""
        with pytest.raises(MCPClientError):
            validate_mcp_server_url("http://10.0.0.5/")

    def test_rejects_file_scheme(self):
        """file:///etc/passwd must be rejected (wrong scheme)."""
        with pytest.raises(MCPClientError):
            validate_mcp_server_url("file:///etc/passwd")

    def test_rejects_ftp_scheme(self):
        """ftp://x must be rejected (wrong scheme)."""
        with pytest.raises(MCPClientError):
            validate_mcp_server_url("ftp://x/")

    def test_rejects_url_with_no_host(self):
        """A URL with no host component must be rejected."""
        with pytest.raises(MCPClientError):
            validate_mcp_server_url("http:///path")
