#!/usr/bin/env python

import sys
import re
import os
from pathlib import Path

try:
    import git
except ImportError:
    git = None

from diff_match_patch import diff_match_patch
from tqdm import tqdm

from aider.dump import dump
from aider.utils import GitTemporaryDirectory


class RelativeIndenter:
    """Rewrites text files to have relative indentation, which involves
    reformatting the leading white space on lines.  This format makes
    it easier to search and apply edits to pairs of code blocks which
    may differ significantly in their overall level of indentation.

    It removes leading white space which is shared with the preceding
    line.

    Original:
    ```
            Foo # indented 8
                Bar # indented 4 more than the previous line
                Baz # same indent as the previous line
                Fob # same indent as the previous line
    ```

    Becomes:
    ```
            Foo # indented 8
        Bar # indented 4 more than the previous line
    Baz # same indent as the previous line
    Fob # same indent as the previous line
    ```

    If the current line is *less* indented then the previous line,
    uses a unicode character to indicate outdenting.

    Original
    ```
            Foo
                Bar
                Baz
            Fob # indented 4 less than the previous line
    ```

    Becomes:
    ```
            Foo
        Bar
    Baz
    ←←←←Fob # indented 4 less than the previous line
    ```

    This is a similar original to the last one, but every line has
    been uniformly outdented:
    ```
    Foo
        Bar
        Baz
    Fob # indented 4 less than the previous line
    ```

    It becomes this result, which is very similar to the previous
    result.  Only the white space on the first line differs.  From the
    word Foo onwards, it is identical to the previous result.
    ```
    Foo
        Bar
    Baz
    ←←←←Fob # indented 4 less than the previous line
    ```

    """

    def __init__(self, texts):
        """
        Based on the texts, choose a unicode character that isn't in any of them.
        """

        chars = set()
        for text in texts:
            chars.update(text)

        ARROW = "←"
        if ARROW not in chars:
            self.marker = ARROW
        else:
            self.marker = self.select_unique_marker(chars)

    def select_unique_marker(self, chars):
        for codepoint in range(0x10FFFF, 0x10000, -1):
            marker = chr(codepoint)
            if marker not in chars:
                return marker

        raise ValueError("Could not find a unique marker")

    def make_relative(self, text):
        """
        Transform text to use relative indents.
        """

        if self.marker in text:
            raise ValueError("Text already contains the outdent marker: {self.marker}")

        lines = text.splitlines(keepends=True)

        output = []
        prev_indent = ""
        for line in lines:
            line_without_end = line.rstrip("\n\r")

            len_indent = len(line_without_end) - len(line_without_end.lstrip())
            indent = line[:len_indent]
            change = len_indent - len(prev_indent)
            if change > 0:
                cur_indent = indent[-change:]
            elif change < 0:
                cur_indent = self.marker * -change
            else:
                cur_indent = ""

            out_line = cur_indent + "\n" + line[len_indent:]
            # dump(len_indent, change, out_line)
            # print(out_line)
            output.append(out_line)
            prev_indent = indent

        res = "".join(output)
        return res

    def make_absolute(self, text):
        """
        Transform text from relative back to absolute indents.
        """
        lines = text.splitlines(keepends=True)

        output = []
        prev_indent = ""
        for i in range(0, len(lines), 2):
            dent = lines[i].rstrip("\r\n")
            non_indent = lines[i + 1]

            if dent.startswith(self.marker):
                len_outdent = len(dent)
                cur_indent = prev_indent[:-len_outdent]
            else:
                cur_indent = prev_indent + dent

            if not non_indent.rstrip("\r\n"):
                out_line = non_indent  # don't indent a blank line
            else:
                out_line = cur_indent + non_indent

            output.append(out_line)
            prev_indent = cur_indent

        res = "".join(output)
        if self.marker in res:
            # dump(res)
            raise ValueError("Error transforming text back to absolute indents")

        return res


# The patches are created to change S->R.
# So all the patch offsets are relative to S.
# But O has a lot more content. So all the offsets are very wrong.
#
# But patch_apply() seems to imply that once patch N is located,
# then it adjusts the offset of the next patch.
#
# This is great, because once we sync up after a big gap the nearby
# patches are close to being located right.
# Except when indentation has been changed by GPT.
#
# It would help to use the diff trick to build map_S_offset_to_O_offset().
# Then update all the S offsets in the S->R patches to be O offsets.
# Do we also need to update the R offsets?
#
# What if this gets funky/wrong?
#


def map_patches(texts, patches, debug):
    search_text, replace_text, original_text = texts

    dmp = diff_match_patch()
    dmp.Diff_Timeout = 5

    diff_s_o = dmp.diff_main(search_text, original_text)
    # diff_r_s = dmp.diff_main(replace_text, search_text)

    # dmp.diff_cleanupSemantic(diff_s_o)
    # dmp.diff_cleanupEfficiency(diff_s_o)

    if debug:
        html = dmp.diff_prettyHtml(diff_s_o)
        Path("tmp.html").write_text(html)

        dump(len(search_text))
        dump(len(original_text))

    for patch in patches:
        start1 = patch.start1
        start2 = patch.start2

        patch.start1 = dmp.diff_xIndex(diff_s_o, start1)
        patch.start2 = dmp.diff_xIndex(diff_s_o, start2)

        if debug:
            print()
            print(start1, repr(search_text[start1 : start1 + 50]))
            print(patch.start1, repr(original_text[patch.start1 : patch.start1 + 50]))
            print(patch.diffs)
            print()

    return patches


example = """Left
Left
    4 in
    4 in
        8 in
    4 in
Left
"""

"""
ri = RelativeIndenter([example])
dump(example)

rel_example = ri.make_relative(example)
dump(repr(rel_example))

abs_example = ri.make_absolute(rel_example)
dump(abs_example)


sys.exit()
"""


def relative_indent(texts):
    ri = RelativeIndenter(texts)
    texts = list(map(ri.make_relative, texts))

    return ri, texts


line_padding = 100


def line_pad(text):
    padding = "\n" * line_padding
    return padding + text + padding


def line_unpad(text):
    if set(text[:line_padding] + text[-line_padding:]) != set("\n"):
        return
    return text[line_padding:-line_padding]


def dmp_apply(texts, remap=True):
    debug = False
    # debug = True

    search_text, replace_text, original_text = texts

    dmp = diff_match_patch()
    dmp.Diff_Timeout = 5
    # dmp.Diff_EditCost = 16

    if remap:
        dmp.Match_Threshold = 0.95
        dmp.Match_Distance = 500
        dmp.Match_MaxBits = 128
        dmp.Patch_Margin = 32
    else:
        dmp.Match_Threshold = 0.5
        dmp.Match_Distance = 100_000
        dmp.Match_MaxBits = 32
        dmp.Patch_Margin = 8

    diff = dmp.diff_main(search_text, replace_text, None)
    dmp.diff_cleanupSemantic(diff)
    dmp.diff_cleanupEfficiency(diff)

    patches = dmp.patch_make(search_text, diff)

    if debug:
        html = dmp.diff_prettyHtml(diff)
        Path("tmp.search_replace_diff.html").write_text(html)

        for d in diff:
            print(d[0], repr(d[1]))

        for patch in patches:
            start1 = patch.start1
            print()
            print(start1, repr(search_text[start1 : start1 + 10]))
            print(start1, repr(replace_text[start1 : start1 + 10]))
            print(patch.diffs)

        # dump(original_text)
        # dump(search_text)

    if remap:
        patches = map_patches(texts, patches, debug)

    patches_text = dmp.patch_toText(patches)

    new_text, success = dmp.patch_apply(patches, original_text)

    all_success = False not in success

    if debug:
        # dump(new_text)
        print(patches_text)

        # print(new_text)
        dump(success)
        dump(all_success)

        # print(new_text)

    if not all_success:
        return

    return new_text


def lines_to_chars(lines, mapping):
    new_text = []
    for char in lines:
        new_text.append(mapping[ord(char)])

    new_text = "".join(new_text)
    return new_text


def dmp_lines_apply(texts, remap=True):
    debug = False
    # debug = True

    for t in texts:
        assert t.endswith("\n"), t

    search_text, replace_text, original_text = texts

    dmp = diff_match_patch()
    dmp.Diff_Timeout = 5
    # dmp.Diff_EditCost = 16

    dmp.Match_Threshold = 0.1
    dmp.Match_Distance = 100_000
    dmp.Match_MaxBits = 32
    dmp.Patch_Margin = 1

    all_text = search_text + replace_text + original_text
    all_lines, _, mapping = dmp.diff_linesToChars(all_text, "")
    assert len(all_lines) == len(all_text.splitlines())

    search_num = len(search_text.splitlines())
    replace_num = len(replace_text.splitlines())
    original_num = len(original_text.splitlines())

    search_lines = all_lines[:search_num]
    replace_lines = all_lines[search_num : search_num + replace_num]
    original_lines = all_lines[search_num + replace_num :]

    assert len(search_lines) == search_num
    assert len(replace_lines) == replace_num
    assert len(original_lines) == original_num

    diff_lines = dmp.diff_main(search_lines, replace_lines, None)
    dmp.diff_cleanupSemantic(diff_lines)
    dmp.diff_cleanupEfficiency(diff_lines)

    patches = dmp.patch_make(search_lines, diff_lines)

    if debug:
        diff = list(diff_lines)
        dmp.diff_charsToLines(diff, mapping)
        # dump(diff)
        html = dmp.diff_prettyHtml(diff)
        Path("tmp.search_replace_diff.html").write_text(html)

        for d in diff:
            print(d[0], repr(d[1]))

    new_lines, success = dmp.patch_apply(patches, original_lines)
    new_text = lines_to_chars(new_lines, mapping)

    all_success = False not in success

    if debug:
        # print(new_text)
        dump(success)
        dump(all_success)

        # print(new_text)

    if not all_success:
        return

    return new_text


def diff_lines(search_text, replace_text):
    dmp = diff_match_patch()
    dmp.Diff_Timeout = 5
    # dmp.Diff_EditCost = 16
    search_lines, replace_lines, mapping = dmp.diff_linesToChars(search_text, replace_text)

    diff_lines = dmp.diff_main(search_lines, replace_lines, None)
    dmp.diff_cleanupSemantic(diff_lines)
    dmp.diff_cleanupEfficiency(diff_lines)

    diff = list(diff_lines)
    dmp.diff_charsToLines(diff, mapping)
    # dump(diff)

    udiff = []
    for d, lines in diff:
        if d < 0:
            d = "-"
        elif d > 0:
            d = "+"
        else:
            d = " "
        for line in lines.splitlines(keepends=True):
            udiff.append(d + line)

    return udiff


def search_and_replace(texts):
    search_text, replace_text, original_text = texts

    num = original_text.count(search_text)
    # if num > 1:
    #    raise SearchTextNotUnique()
    if num == 0:
        return

    new_text = original_text.replace(search_text, replace_text)

    return new_text


def git_cherry_pick_osr_onto_o(texts):
    search_text, replace_text, original_text = texts

    with GitTemporaryDirectory() as dname:
        repo = git.Repo(dname)

        fname = Path(dname) / "file.txt"

        # Make O->S->R
        fname.write_text(original_text)
        repo.git.add(str(fname))
        repo.git.commit("-m", "original")
        original_hash = repo.head.commit.hexsha

        fname.write_text(search_text)
        repo.git.add(str(fname))
        repo.git.commit("-m", "search")

        fname.write_text(replace_text)
        repo.git.add(str(fname))
        repo.git.commit("-m", "replace")
        replace_hash = repo.head.commit.hexsha

        # go back to O
        repo.git.checkout(original_hash)

        # cherry pick R onto original
        try:
            repo.git.cherry_pick(replace_hash, "--minimal")
        except (git.exc.ODBError, git.exc.GitError):
            # merge conflicts!
            return

        new_text = fname.read_text()
        return new_text


def git_cherry_pick_sr_onto_so(texts):
    search_text, replace_text, original_text = texts

    with GitTemporaryDirectory() as dname:
        repo = git.Repo(dname)

        fname = Path(dname) / "file.txt"

        fname.write_text(search_text)
        repo.git.add(str(fname))
        repo.git.commit("-m", "search")
        search_hash = repo.head.commit.hexsha

        # make search->replace
        fname.write_text(replace_text)
        repo.git.add(str(fname))
        repo.git.commit("-m", "replace")
        replace_hash = repo.head.commit.hexsha

        # go back to search,
        repo.git.checkout(search_hash)

        # make search->original
        fname.write_text(original_text)
        repo.git.add(str(fname))
        repo.git.commit("-m", "original")

        # cherry pick replace onto original
        try:
            repo.git.cherry_pick(replace_hash, "--minimal")
        except (git.exc.ODBError, git.exc.GitError):
            # merge conflicts!
            return

        new_text = fname.read_text()

        return new_text


class SearchTextNotUnique(ValueError):
    pass


all_preprocs = [
    # (strip_blank_lines, relative_indent, reverse_lines)
    (False, False, False),
    (True, False, False),
    (False, True, False),
    (True, True, False),
    # (False, False, True),
    # (True, False, True),
    # (False, True, True),
    # (True, True, True),
]

always_relative_indent = [
    (False, True, False),
    (True, True, False),
    # (False, True, True),
    # (True, True, True),
]

editblock_strategies = [
    (search_and_replace, all_preprocs),
    (git_cherry_pick_osr_onto_o, all_preprocs),
    (dmp_lines_apply, all_preprocs),
]

never_relative = [
    (False, False),
    (True, False),
]

udiff_strategies = [
    (search_and_replace, all_preprocs),
    (git_cherry_pick_osr_onto_o, all_preprocs),
    (dmp_lines_apply, all_preprocs),
]


def flexible_search_and_replace(texts, strategies):
    """Try a series of search/replace methods, starting from the most
    literal interpretation of search_text. If needed, progress to more
    flexible methods, which can accommodate divergence between
    search_text and original_text and yet still achieve the desired
    edits.
    """

    for strategy, preprocs in strategies:
        for preproc in preprocs:
            res = try_strategy(texts, strategy, preproc)
            if res:
                return res


def reverse_lines(text):
    lines = text.splitlines(keepends=True)
    lines.reverse()
    return "".join(lines)


def try_strategy(texts, strategy, preproc):
    preproc_strip_blank_lines, preproc_relative_indent, preproc_reverse = preproc
    ri = None

    if preproc_strip_blank_lines:
        texts = strip_blank_lines(texts)
    if preproc_relative_indent:
        ri, texts = relative_indent(texts)
    if preproc_reverse:
        texts = list(map(reverse_lines, texts))

    res = strategy(texts)

    if res and preproc_reverse:
        res = reverse_lines(res)

    if res and preproc_relative_indent:
        try:
            res = ri.make_absolute(res)
        except ValueError:
            return

    return res


def strip_blank_lines(texts):
    # strip leading and trailing blank lines
    texts = [text.strip("\n") + "\n" for text in texts]
    return texts


def read_text(fname):
    text = Path(fname).read_text()
    return text


def proc(dname):
    dname = Path(dname)

    try:
        search_text = read_text(dname / "search")
        replace_text = read_text(dname / "replace")
        original_text = read_text(dname / "original")
    except FileNotFoundError:
        return

    ####

    texts = search_text, replace_text, original_text

    strategies = [
        # (search_and_replace, all_preprocs),
        # (git_cherry_pick_osr_onto_o, all_preprocs),
        # (git_cherry_pick_sr_onto_so, all_preprocs),
        # (dmp_apply, all_preprocs),
        (dmp_lines_apply, all_preprocs),
    ]

    _strategies = editblock_strategies  # noqa: F841

    short_names = dict(
        search_and_replace="sr",
        git_cherry_pick_osr_onto_o="cp_o",
        git_cherry_pick_sr_onto_so="cp_so",
        dmp_apply="dmp",
        dmp_lines_apply="dmpl",
    )

    patched = dict()
    for strategy, preprocs in strategies:
        for preproc in preprocs:
            method = strategy.__name__
            method = short_names[method]

            strip_blank, rel_indent, rev_lines = preproc
            if strip_blank or rel_indent:
                method += "_"
            if strip_blank:
                method += "s"
            if rel_indent:
                method += "i"
            if rev_lines:
                method += "r"

            res = try_strategy(texts, strategy, preproc)
            patched[method] = res

    results = []
    for method, res in patched.items():
        out_fname = dname / f"original.{method}"
        if out_fname.exists():
            out_fname.unlink()

        if res:
            out_fname.write_text(res)

            correct = (dname / "correct").read_text()
            if res == correct:
                res = "pass"
            else:
                res = "WRONG"
        else:
            res = "fail"

        results.append((method, res))

    return results


def colorize_result(result):
    colors = {
        "pass": "\033[102;30mpass\033[0m",  # Green background, black text
        "WRONG": "\033[101;30mWRONG\033[0m",  # Red background, black text
        "fail": "\033[103;30mfail\033[0m",  # Yellow background, black text
    }
    return colors.get(result, result)  # Default to original result if not found


def main(dnames):
    all_results = []
    for dname in tqdm(dnames):
        dname = Path(dname)
        results = proc(dname)
        for method, res in results:
            all_results.append((dname, method, res))
            # print(dname, method, colorize_result(res))

    # Create a 2D table with directories along the right and methods along the top
    # Collect all unique methods and directories
    methods = []
    for _, method, _ in all_results:
        if method not in methods:
            methods.append(method)

    directories = dnames

    # Sort directories by decreasing number of 'pass' results
    pass_counts = {
        dname: sum(
            res == "pass" for dname_result, _, res in all_results if str(dname) == str(dname_result)
        )
        for dname in directories
    }
    directories.sort(key=lambda dname: pass_counts[dname], reverse=True)

    # Create a results matrix
    results_matrix = {dname: {method: "" for method in methods} for dname in directories}

    # Populate the results matrix
    for dname, method, res in all_results:
        results_matrix[str(dname)][method] = res

    # Print the 2D table
    # Print the header
    print("{:<20}".format("Directory"), end="")
    for method in methods:
        print("{:<9}".format(method), end="")
    print()

    # Print the rows with colorized results
    for dname in directories:
        print("{:<20}".format(Path(dname).name), end="")
        for method in methods:
            res = results_matrix[dname][method]
            colorized_res = colorize_result(res)
            res_l = 9 + len(colorized_res) - len(res)
            fmt = "{:<" + str(res_l) + "}"
            print(fmt.format(colorized_res), end="")
        print()


class SearchReplaceBlockParser:
    """
    Parser for AI-generated SEARCH/REPLACE blocks in the format:
    
    file/path/here.py
    ```python
    <<<<<<< SEARCH
    search text here
    =======
    replace text here
    >>>>>>> REPLACE
    ```
    """
    
    def __init__(self):
        # Regex pattern to match the SEARCH/REPLACE block format
        self.block_pattern = re.compile(
            r'([^\n]+)\n```[a-zA-Z]*\n<<<<<<< SEARCH\n(.*?)\n=======\n(.*?)\n>>>>>>> REPLACE\n```',
            re.DOTALL | re.MULTILINE
        )
        
        # Alternative pattern for blocks without explicit file extensions in code fence
        self.block_pattern_alt = re.compile(
            r'([^\n]+)\n```\n<<<<<<< SEARCH\n(.*?)\n=======\n(.*?)\n>>>>>>> REPLACE\n```',
            re.DOTALL | re.MULTILINE
        )
        
        # Pattern for raw blocks (without code fences)
        self.raw_block_pattern = re.compile(
            r'([^\n]+)\n<<<<<<< SEARCH\n(.*?)\n=======\n(.*?)\n>>>>>>> REPLACE',
            re.DOTALL | re.MULTILINE
        )

    def parse_blocks(self, ai_output):
        """
        Parse SEARCH/REPLACE blocks from AI output.
        
        Args:
            ai_output (str): The raw output from the AI containing SEARCH/REPLACE blocks
            
        Returns:
            list: List of tuples (file_path, search_text, replace_text)
        """
        blocks = []
        
        # Try primary pattern first
        matches = self.block_pattern.findall(ai_output)
        blocks.extend(matches)
        
        # Try alternative pattern
        if not matches:
            matches = self.block_pattern_alt.findall(ai_output)
            blocks.extend(matches)
        
        # Try raw pattern as fallback
        if not matches:
            matches = self.raw_block_pattern.findall(ai_output)
            blocks.extend(matches)
        
        # Clean up the blocks
        cleaned_blocks = []
        for file_path, search_text, replace_text in blocks:
            file_path = file_path.strip()
            search_text = search_text.rstrip('\n\r')
            replace_text = replace_text.rstrip('\n\r')
            
            # Validate file path
            if not file_path or file_path.startswith('#') or file_path.startswith('//'):
                continue
                
            cleaned_blocks.append((file_path, search_text, replace_text))
        
        return cleaned_blocks

    def extract_blocks_with_context(self, ai_output):
        """
        Extract blocks with additional context information.
        
        Returns:
            list: List of dicts with detailed block information
        """
        blocks = []
        
        # Find all matches with their positions
        for match in self.block_pattern.finditer(ai_output):
            file_path, search_text, replace_text = match.groups()
            blocks.append({
                'file_path': file_path.strip(),
                'search_text': search_text.rstrip('\n\r'),
                'replace_text': replace_text.rstrip('\n\r'),
                'start_pos': match.start(),
                'end_pos': match.end(),
                'raw_match': match.group(0)
            })
        
        return blocks


class SearchReplaceApplicator:
    """
    Applies parsed SEARCH/REPLACE blocks to files using robust search/replace strategies.
    """
    
    def __init__(self, base_dir=".", backup=True, dry_run=False):
        self.base_dir = Path(base_dir)
        self.backup = backup
        self.dry_run = dry_run
        self.results = []
        
    def apply_blocks(self, blocks, strategies=None):
        """
        Apply a list of SEARCH/REPLACE blocks to files.
        
        Args:
            blocks (list): List of (file_path, search_text, replace_text) tuples
            strategies (list): List of strategies to try (defaults to editblock_strategies)
            
        Returns:
            dict: Results summary with success/failure counts and details
        """
        if strategies is None:
            strategies = editblock_strategies
            
        results = {
            'total_blocks': len(blocks),
            'successful': 0,
            'failed': 0,
            'skipped': 0,
            'details': []
        }
        
        for i, (file_path, search_text, replace_text) in enumerate(blocks):
            print(f"Processing block {i+1}/{len(blocks)}: {file_path}")
            
            block_result = self.apply_single_block(
                file_path, search_text, replace_text, strategies
            )
            
            results['details'].append(block_result)
            
            if block_result['status'] == 'success':
                results['successful'] += 1
            elif block_result['status'] == 'failed':
                results['failed'] += 1
            else:
                results['skipped'] += 1
                
        return results
    
    def apply_single_block(self, file_path, search_text, replace_text, strategies):
        """
        Apply a single SEARCH/REPLACE block to a file.
        
        Returns:
            dict: Result details for this block
        """
        result = {
            'file_path': file_path,
            'status': 'failed',
            'message': '',
            'strategy_used': None,
            'backup_path': None
        }
        
        try:
            # Resolve file path
            full_path = self.base_dir / file_path
            
            if not full_path.exists():
                result['message'] = f"File does not exist: {full_path}"
                result['status'] = 'skipped'
                return result
            
            # Read original content
            try:
                original_text = full_path.read_text(encoding='utf-8')
            except UnicodeDecodeError:
                try:
                    original_text = full_path.read_text(encoding='latin-1')
                except Exception as e:
                    result['message'] = f"Could not read file: {e}"
                    return result
            
            # Ensure texts end with newline for proper processing
            if not search_text.endswith('\n'):
                search_text += '\n'
            if not replace_text.endswith('\n'):
                replace_text += '\n'
            if not original_text.endswith('\n'):
                original_text += '\n'
            
            # Create backup if requested
            if self.backup and not self.dry_run:
                backup_path = full_path.with_suffix(full_path.suffix + '.bak')
                backup_path.write_text(original_text, encoding='utf-8')
                result['backup_path'] = str(backup_path)
            
            # Try applying the change using flexible strategies
            texts = (search_text, replace_text, original_text)
            new_text = flexible_search_and_replace(texts, strategies)
            
            if new_text is None:
                result['message'] = "All search/replace strategies failed"
                return result
            
            # Write the new content
            if not self.dry_run:
                full_path.write_text(new_text, encoding='utf-8')
                result['status'] = 'success'
                result['message'] = f"Successfully updated {file_path}"
            else:
                result['status'] = 'success'
                result['message'] = f"DRY RUN: Would update {file_path}"
            
            # Determine which strategy worked (simplified detection)
            if original_text.count(search_text.rstrip('\n')) > 0:
                result['strategy_used'] = 'literal_search_replace'
            else:
                result['strategy_used'] = 'flexible_search_replace'
                
        except Exception as e:
            result['message'] = f"Unexpected error: {e}"
            import traceback
            result['traceback'] = traceback.format_exc()
        
        return result
    
    def print_results_summary(self, results):
        """Print a summary of the application results."""
        print("\n" + "="*60)
        print("SEARCH/REPLACE BLOCKS APPLICATION SUMMARY")
        print("="*60)
        print(f"Total blocks processed: {results['total_blocks']}")
        print(f"Successful: {results['successful']}")
        print(f"Failed: {results['failed']}")
        print(f"Skipped: {results['skipped']}")
        print("-"*60)
        
        for detail in results['details']:
            status_icon = "✓" if detail['status'] == 'success' else "✗" if detail['status'] == 'failed' else "⊝"
            print(f"{status_icon} {detail['file_path']}: {detail['message']}")
            if detail.get('strategy_used'):
                print(f"   Strategy: {detail['strategy_used']}")
            if detail.get('backup_path'):
                print(f"   Backup: {detail['backup_path']}")
        
        print("="*60)


def apply_search_replace_blocks(ai_output, base_dir=".", backup=True, dry_run=False, strategies=None):
    """
    High-level function to parse and apply SEARCH/REPLACE blocks from AI output.
    
    Args:
        ai_output (str): Raw AI output containing SEARCH/REPLACE blocks
        base_dir (str): Base directory for resolving relative file paths
        backup (bool): Whether to create backup files
        dry_run (bool): If True, don't actually modify files
        strategies (list): Search/replace strategies to use
        
    Returns:
        dict: Results summary
    """
    # Parse blocks from AI output
    parser = SearchReplaceBlockParser()
    blocks = parser.parse_blocks(ai_output)
    
    if not blocks:
        print("No SEARCH/REPLACE blocks found in the input.")
        return {
            'total_blocks': 0,
            'successful': 0,
            'failed': 0,
            'skipped': 0,
            'details': []
        }
    
    print(f"Found {len(blocks)} SEARCH/REPLACE blocks to process.")
    
    # Apply blocks to files
    applicator = SearchReplaceApplicator(base_dir=base_dir, backup=backup, dry_run=dry_run)
    results = applicator.apply_blocks(blocks, strategies)
    
    # Print summary
    applicator.print_results_summary(results)
    
    return results


def validate_search_replace_block(file_path, search_text, replace_text):
    """
    Validate a single SEARCH/REPLACE block before applying it.
    
    Returns:
        tuple: (is_valid, error_message)
    """
    if not file_path:
        return False, "File path is empty"
    
    if not search_text:
        return False, "Search text is empty"
    
    # Replace text can be empty (for deletions)
    
    # Check if file path looks reasonable
    if file_path.startswith('/') and not Path(file_path).exists():
        return False, f"Absolute path does not exist: {file_path}"
    
    return True, "Valid"


def preview_search_replace_blocks(ai_output, base_dir="."):
    """
    Preview what SEARCH/REPLACE blocks would do without applying them.
    
    Args:
        ai_output (str): Raw AI output containing SEARCH/REPLACE blocks
        base_dir (str): Base directory for resolving relative file paths
        
    Returns:
        list: List of preview information for each block
    """
    parser = SearchReplaceBlockParser()
    blocks = parser.parse_blocks(ai_output)
    
    previews = []
    base_path = Path(base_dir)
    
    for i, (file_path, search_text, replace_text) in enumerate(blocks):
        preview = {
            'block_number': i + 1,
            'file_path': file_path,
            'file_exists': (base_path / file_path).exists(),
            'search_text_preview': search_text[:100] + ('...' if len(search_text) > 100 else ''),
            'replace_text_preview': replace_text[:100] + ('...' if len(replace_text) > 100 else ''),
            'validation': validate_search_replace_block(file_path, search_text, replace_text)
        }
        
        # Check if search text exists in file
        if preview['file_exists']:
            try:
                content = (base_path / file_path).read_text(encoding='utf-8')
                preview['search_text_found'] = search_text.strip() in content
                preview['search_occurrences'] = content.count(search_text.strip())
            except Exception as e:
                preview['search_text_found'] = False
                preview['file_read_error'] = str(e)
        
        previews.append(preview)
    
    return previews


def print_preview(previews):
    """Print a formatted preview of SEARCH/REPLACE blocks."""
    print("\n" + "="*80)
    print("SEARCH/REPLACE BLOCKS PREVIEW")
    print("="*80)
    
    for preview in previews:
        print(f"\nBlock {preview['block_number']}: {preview['file_path']}")
        print("-" * 50)
        
        # File status
        if preview['file_exists']:
            print("✓ File exists")
            if 'search_text_found' in preview:
                if preview['search_text_found']:
                    print(f"✓ Search text found ({preview['search_occurrences']} occurrences)")
                else:
                    print("✗ Search text not found - will use flexible matching")
        else:
            print("✗ File does not exist")
        
        # Validation
        is_valid, msg = preview['validation']
        if is_valid:
            print("✓ Block validation passed")
        else:
            print(f"✗ Block validation failed: {msg}")
        
        # Content preview
        print(f"Search: {preview['search_text_preview']}")
        print(f"Replace: {preview['replace_text_preview']}")
        
        if 'file_read_error' in preview:
            print(f"⚠ File read error: {preview['file_read_error']}")
    
    print("="*80)


if __name__ == "__main__":
    status = main(sys.argv[1:])
    sys.exit(status)
