import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';

export interface PermissionChangeDialogData {
  employeeId: string;
  employeeName: string;
  currentRole: 'admin' | 'employee';
}

@Component({
  selector: 'app-permission-change-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    FormsModule
  ],
  templateUrl: './permission-change-dialog.component.html',
  styleUrl: './permission-change-dialog.component.css'
})
export class PermissionChangeDialogComponent {
  selectedRole: 'admin' | 'employee';

  constructor(
    public dialogRef: MatDialogRef<PermissionChangeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PermissionChangeDialogData
  ) {
    this.selectedRole = data.currentRole;
  }

  getRoleLabel(role: 'admin' | 'employee'): string {
    return role === 'admin' ? '管理者' : '一般社員';
  }

  save(): void {
    if (this.selectedRole === this.data.currentRole) {
      this.dialogRef.close(null);
      return;
    }

    const confirmed = confirm(
      `「${this.data.employeeName}」の権限を「${this.getRoleLabel(this.selectedRole)}」に変更しますか？`
    );

    if (confirmed) {
      this.dialogRef.close(this.selectedRole);
    }
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}

