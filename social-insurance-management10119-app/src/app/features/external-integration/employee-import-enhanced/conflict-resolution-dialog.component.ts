import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { Employee } from '../../../core/models/employee.model';

export interface FieldDiff {
  field: string;
  fieldLabel: string;
  before: any;
  after: any;
  changeType: 'add' | 'update' | 'delete';
}

export interface ConflictResolutionDialogData {
  importedEmployee: any;
  existingEmployee: Employee;
  diffs: FieldDiff[];
}

@Component({
  selector: 'app-conflict-resolution-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatRadioModule,
    MatCheckboxModule,
    FormsModule
  ],
  templateUrl: './conflict-resolution-dialog.component.html',
  styleUrl: './conflict-resolution-dialog.component.css'
})
export class ConflictResolutionDialogComponent implements OnInit {
  resolution: 'overwrite' | 'skip' | 'merge' | 'individual' = 'individual';
  selected = true;

  constructor(
    public dialogRef: MatDialogRef<ConflictResolutionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConflictResolutionDialogData
  ) {}

  ngOnInit(): void {
    // 既存の解決方法があれば使用
    if (this.data.importedEmployee.conflictResolution) {
      this.resolution = this.data.importedEmployee.conflictResolution;
    }
    if (this.data.importedEmployee.selected !== undefined) {
      this.selected = this.data.importedEmployee.selected;
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    this.dialogRef.close({
      resolution: this.resolution,
      selected: this.selected
    });
  }

  formatValue(value: any): string {
    if (value === null || value === undefined) return '-';
    if (value instanceof Date) {
      return value.toLocaleDateString('ja-JP');
    }
    return String(value);
  }

  getChangeTypeLabel(changeType: string): string {
    const labels: { [key: string]: string } = {
      'add': '追加',
      'update': '更新',
      'delete': '削除'
    };
    return labels[changeType] || changeType;
  }

  getChangeTypeClass(changeType: string): string {
    return `change-type-${changeType}`;
  }
}
