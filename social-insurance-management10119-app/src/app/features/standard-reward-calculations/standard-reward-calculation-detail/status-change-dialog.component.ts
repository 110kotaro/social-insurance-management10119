import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';

export interface StatusChangeDialogData {
  currentStatus: 'confirmed' | 'applied' | 'approved';
  employeeName?: string; // 個別変更の場合は社員名、一括変更の場合はundefined
  count?: number; // 一括変更の場合は件数
}

@Component({
  selector: 'app-status-change-dialog',
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
  templateUrl: './status-change-dialog.component.html',
  styleUrl: './status-change-dialog.component.css'
})
export class StatusChangeDialogComponent {
  selectedStatus: 'applied' | 'approved';

  constructor(
    public dialogRef: MatDialogRef<StatusChangeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: StatusChangeDialogData
  ) {
    // デフォルトは現在のステータスと同じにする（appliedまたはapproved）
    this.selectedStatus = data.currentStatus === 'confirmed' ? 'applied' : data.currentStatus;
  }

  getStatusLabel(status: 'confirmed' | 'applied' | 'approved'): string {
    const labels: Record<string, string> = {
      'confirmed': '確定済み',
      'applied': '申請済み',
      'approved': '承認済み'
    };
    return labels[status] || status;
  }

  save(): void {
    if (this.selectedStatus === this.data.currentStatus) {
      this.dialogRef.close(null);
      return;
    }

    const message = this.data.count 
      ? `${this.data.count}件の計算結果のステータスを「${this.getStatusLabel(this.selectedStatus)}」に変更しますか？`
      : `ステータスを「${this.getStatusLabel(this.selectedStatus)}」に変更しますか？`;

    const confirmed = confirm(message);

    if (confirmed) {
      this.dialogRef.close(this.selectedStatus);
    }
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
