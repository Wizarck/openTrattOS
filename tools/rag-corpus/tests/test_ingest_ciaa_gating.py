"""CIAA permission gating: must exit cleanly without ingesting when permission absent."""

from __future__ import annotations

import pytest

from rag_corpus.ingest_ciaa import main


def test_ciaa_no_permission_exits_zero(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("CIAA_PERMISSION_GRANTED", raising=False)
    rc = main([])
    assert rc == 0
    captured = capsys.readouterr()
    assert "GATED" in captured.out
    assert "CIAA_PERMISSION_GRANTED" in captured.out


def test_ciaa_false_permission_exits_zero(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("CIAA_PERMISSION_GRANTED", "false")
    assert main([]) == 0
    captured = capsys.readouterr()
    assert "GATED" in captured.out


def test_ciaa_granted_proceeds_but_inert(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("CIAA_PERMISSION_GRANTED", "true")
    assert main([]) == 0
    captured = capsys.readouterr()
    # When permission granted, the script runs but the actual ingestion logic is
    # intentionally not implemented in this slice.
    assert "intentionally not implemented" in captured.out
