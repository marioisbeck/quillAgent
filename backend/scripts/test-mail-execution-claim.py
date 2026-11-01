#!/usr/bin/env python3
"""Offline real-route/SQLite contract checks; never load operator credentials."""
import concurrent.futures
from contextlib import closing
import copy
import http.client
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parents[2]


class MailClaimRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.home = Path(cls.temp.name)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        cls.log = (cls.home / 'backend.log').open('w+')
        cls.process = subprocess.Popen(
            [str(ROOT / 'node_modules/.bin/tsx'), str(ROOT / 'backend/src/index.ts')],
            cwd=cls.home, stdout=cls.log, stderr=subprocess.STDOUT,
            env={'PATH': os.environ['PATH'], 'HOME': str(cls.home),
                 'QUILL_API_KEY': 'offline-contract-fixture', 'PORT': str(cls.port),
                 'QUILL_RATE_LIMIT_DISABLED': '1'})
        for _ in range(150):
            try:
                cls.http('GET', '/health')
                return
            except OSError:
                if cls.process.poll() is not None:
                    cls.log.seek(0)
                    raise RuntimeError(cls.log.read())
                time.sleep(.1)
        raise RuntimeError('Disposable backend did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(10)
        cls.log.close()
        cls.temp.cleanup()

    @classmethod
    def http(cls, method, path, body=None):
        connection = http.client.HTTPConnection('127.0.0.1', cls.port, timeout=5)
        try:
            connection.request(method, path, body=None if body is None else json.dumps(body),
                               headers={'Content-Type': 'application/json',
                                        'x-quill-api-key': 'offline-contract-fixture'})
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def card(self, connector='mail', action='Bounded Gmail state approval'):
        details = {'operation': 'change_gmail_state', 'account': 'marioisbeck@gmail.com',
                   'selection': {'trash': [{'id': 'abc123', 'thread_id': 'aaa', 'labels': ['INBOX']}]},
                   'bridgeApprovalId': 'local-fixture', 'resumeToken': 'fixture-token',
                   'executionStatus': 'pending'}
        code, created = self.http('POST', '/api/approvals', {
            'action': action, 'payload': {'connector': connector, 'summary': 'offline fixture', 'details': details}})
        self.assertEqual(code, 201)
        card = created.get('approval', created)
        self.http('PUT', f"/api/approvals/{card['id']}", {'status': 'approved'})
        return self.http('GET', f"/api/approvals/{card['id']}")[1]

    def guard(self, card, token='a' * 32):
        d = card['payload']['details']
        return {'version': 1, 'owner': 'mail_gmail_state', 'token': token,
                'identity': {'action': card['action'], 'connector': 'mail',
                             **{k: d[k] for k in ('operation', 'account', 'selection', 'bridgeApprovalId', 'resumeToken')}}}

    def report(self, card, status, guard=None, result=None):
        body = {'executionStatus': status, 'executionResult': result,
                'executionError': None, 'executedAt': None}
        if guard is not None:
            body['executionGuard'] = guard
        return self.http('PATCH', f"/api/approvals/{card['id']}/execution", body)

    def snapshot(self, card):
        path = f"/api/approvals/{card['id']}"
        return self.http('GET', path)[1], self.http('GET', path + '/audit')[1]

    def test_mail_contract_claim_terminal_and_late_report_rejection(self):
        card = self.card()
        self.assertEqual(card.get('mailGmailStateGuardVersion'), 1)
        guard = self.guard(card)
        code, ack = self.report(card, 'running', guard)
        self.assertEqual(code, 200)
        self.assertEqual(ack['approval']['payload']['details']['executionClaim'], guard)
        self.assertEqual(self.report(card, 'completed', guard, {'verified_count': 1})[0], 200)
        before = self.snapshot(card)
        for bad in (None, self.guard(card, 'b' * 32)):
            self.assertEqual(self.report(card, 'failed', bad)[0], 409)
            self.assertEqual(self.snapshot(card), before)

    def test_newer_state_between_get_and_claim_preserves_receipt_and_audit(self):
        for newer in ('running', 'completed', 'failed'):
            with self.subTest(newer=newer):
                card = self.card()
                # A separate connection commits newer data after the binding GET.
                # No production DB is used. The route must read inside its transaction.
                with closing(sqlite3.connect(self.home / 'quill.db')) as db, db:
                    payload = copy.deepcopy(card['payload'])
                    payload['details'].update(executionStatus=newer, executionResult={'newer_receipt': True})
                    db.execute('UPDATE approvals SET payload=? WHERE id=?', (json.dumps(payload), card['id']))
                before = self.snapshot(card)
                self.assertEqual(self.report(card, 'running', self.guard(card))[0], 409)
                self.assertEqual(self.snapshot(card), before)

    def test_transaction_waits_for_competing_commit_before_reading_pending(self):
        card = self.card()
        with closing(sqlite3.connect(self.home / 'quill.db')) as db:
            db.execute('BEGIN IMMEDIATE')
            payload = copy.deepcopy(card['payload'])
            payload['details'].update(executionStatus='completed', executionResult={'competing_commit': True})
            db.execute('UPDATE approvals SET payload=? WHERE id=?', (json.dumps(payload), card['id']))
            with concurrent.futures.ThreadPoolExecutor(1) as pool:
                pending = pool.submit(self.report, card, 'running', self.guard(card))
                time.sleep(.1)
                self.assertFalse(pending.done())
                db.commit()
                self.assertEqual(pending.result(timeout=5)[0], 409)
        self.assertEqual(self.snapshot(card)[0]['payload']['details']['executionResult'], {'competing_commit': True})

    def test_concurrent_claims_have_one_owner(self):
        card = self.card()
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            responses = list(pool.map(lambda token: self.report(card, 'running', self.guard(card, token))[0],
                                      ('a' * 32, 'b' * 32)))
        self.assertEqual(sorted(responses), [200, 409])

    def test_full_identity_and_owner_are_required(self):
        card = self.card()
        for field in self.guard(card)['identity']:
            guard = self.guard(card)
            guard['identity'][field] = 'wrong'
            before = self.snapshot(card)
            self.assertEqual(self.report(card, 'running', guard)[0], 409)
            self.assertEqual(self.snapshot(card), before)
        wrong = self.guard(card)
        wrong['owner'] = 'gateway_parity'
        self.assertEqual(self.report(card, 'running', wrong)[0], 409)

    def test_gateway_and_server_ownership_is_preserved(self):
        card = self.card(connector='gateway', action='gateway_fixture')
        d = card['payload']['details']
        guard = {'version': 1, 'owner': 'gateway_parity', 'token': 'c' * 32,
                 'identity': {'action': card['action'], 'connector': 'gateway', 'kind': None,
                              'bridgeApprovalId': d['bridgeApprovalId'], 'resumeToken': d['resumeToken']}}
        self.assertEqual(self.report(card, 'running', self.guard(card))[0], 409)
        self.assertEqual(self.report(card, 'running', guard)[0], 200)
        self.assertEqual(self.report(card, 'completed', guard, {'done': True})[0], 200)
        self.assertEqual(self.report(card, 'failed')[0], 409)
        server = self.card(connector='gateway', action='server_route_codex')
        guard['identity']['action'] = server['action']
        self.assertEqual(self.report(server, 'running', guard)[0], 409)

    def test_claim_blocks_manual_identity_and_execution_edits(self):
        card = self.card()
        guard = self.guard(card)
        self.assertEqual(self.report(card, 'running', guard)[0], 200)
        before = self.snapshot(card)
        for field in ('account', 'operation', 'selection', 'bridgeApprovalId', 'resumeToken',
                      'executionStatus', 'executionClaim', 'executionResult'):
            self.assertEqual(self.http('PUT', f"/api/approvals/{card['id']}", {
                'status': 'approved', 'manualEdit': {'details': {field: 'changed'}}})[0], 409)
            self.assertEqual(self.snapshot(card), before)

    @unittest.skipUnless(os.environ.get('QUILL_MAIL_FIXTURE_SCRIPTS'), 'pass isolated mail scripts for consumer integration')
    def test_real_consumer_interleavings_and_receipts(self):
        sys.path.insert(0, os.environ['QUILL_MAIL_FIXTURE_SCRIPTS'])
        import quill_mail_bridge as mail
        import quill_mail_executor as em
        import quill_mail_state as state
        from test_quill_mail_state import ApprovalLifecycleTests
        from unittest.mock import patch
        for outcome in ('newer_running', 'newer_completed', 'newer_failed', 'completed', 'partial'):
            with self.subTest(outcome=outcome):
                fixture = ApprovalLifecycleTests()
                fixture.setUp()
                try:
                    def mirror(**kwargs):
                        code, created = self.http('POST', '/api/approvals', {
                            'action': kwargs['action'], 'payload': kwargs['body']})
                        self.assertEqual(code, 201)
                        card = created.get('approval', created)
                        self.assertEqual(self.http('PUT', f"/api/approvals/{card['id']}", {'status': 'approved'})[0], 200)
                        return {'id': card['id']}
                    fixture.bridge.create_backend_approval = mirror
                    response = fixture.make_request()
                    card = self.http('GET', f"/api/approvals/{response['approval_request_id']}")[1]
                    executor = em.QuillMailExecutor.__new__(em.QuillMailExecutor)
                    executor.bridge = fixture.bridge
                    executor.backend_api_key = 'offline-contract-fixture'
                    executor.backend_api_url = f'http://127.0.0.1:{self.port}/api'
                    transport = executor.backend_json
                    before = None
                    def interleave(path, method='GET', payload=None):
                        nonlocal before
                        if method == 'PATCH' and before is None and outcome.startswith('newer_'):
                            with closing(sqlite3.connect(self.home / 'quill.db')) as db, db:
                                p = copy.deepcopy(card['payload'])
                                p['details'].update(executionStatus=outcome[6:], executionResult={'newer': True})
                                db.execute('UPDATE approvals SET payload=? WHERE id=?', (json.dumps(p), card['id']))
                            before = self.snapshot(card)
                        return transport(path, method=method, payload=payload)
                    executor.backend_json = interleave
                    receipt = {'verified_count': 1, 'automatic_retry_allowed': False}
                    def mutate(*args):
                        if outcome == 'partial':
                            raise state.PartialStateChangeError(receipt)
                        return receipt
                    with patch.object(state, 'apply_message_state', side_effect=mutate) as provider:
                        result = executor.execute_approval(card)
                        if outcome.startswith('newer_'):
                            provider.assert_not_called()
                            self.assertEqual(self.snapshot(card), before)
                            self.assertEqual(result['status'], 'unknown')
                            self.assertIn('report_inflight', mail.load_approval_store()['requests'][0])
                        else:
                            self.assertEqual(provider.call_count, 1)
                            self.assertEqual(result['status'], 'failed' if outcome == 'partial' else 'completed')
                            saved = self.snapshot(card)[0]['payload']['details']
                            self.assertEqual(saved['executionResult']['result'], receipt)
                            self.assertNotIn('report_inflight', mail.load_approval_store()['requests'][0])
                            executor.execute_approval(card)
                            self.assertEqual(provider.call_count, 1)
                finally:
                    fixture.doCleanups()


if __name__ == '__main__':
    unittest.main()
